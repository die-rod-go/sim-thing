import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { buildSeededWorld, loadSeedFile } from "../seeds";
import { loadWorldMap } from "../world/map-loader";
import { createRandomWalkStrategy } from "./random-walk";
import { createWorldState, type TickResult, type WorldState } from "./world-state";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const map = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));
const seedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));

function buildState(): WorldState {
  return createWorldState(map, buildSeededWorld(seedFile, map));
}

async function runTicks(state: WorldState, tickCount: number): Promise<TickResult[]> {
  const advanceTick = createRandomWalkStrategy();
  const results: TickResult[] = [];
  for (let index = 0; index < tickCount; index++) {
    results.push(await advanceTick(state));
    state.tick += 1;
  }
  return results;
}

describe("random walk strategy", () => {
  it("moves agents one walkable tile per tick", async () => {
    const state = buildState();
    const previous = new Map(state.agents.map((agent) => [agent.id, agent.pos]));
    for (const result of await runTicks(state, 120)) {
      for (const move of result.moves) {
        const from = previous.get(move.agentId);
        if (!from) throw new Error("unknown agent");
        expect(Math.abs(move.pos.x - from.x) + Math.abs(move.pos.y - from.y)).toBe(1);
        expect(map.grid.isWall[move.pos.y * map.grid.width + move.pos.x]).toBe(false);
        previous.set(move.agentId, move.pos);
      }
    }
  });

  it("logs walk_started and arrived events with every field filled", async () => {
    const state = buildState();
    const events = (await runTicks(state, 200)).flatMap((result) => result.events);
    const started = events.filter((event) => event.kind === "walk_started");
    const arrived = events.filter((event) => event.kind === "arrived");
    expect(started.length).toBeGreaterThanOrEqual(state.agents.length);
    expect(arrived.length).toBeGreaterThan(0);
    for (const event of arrived) {
      expect(event.place).toBe(event.targetName);
      expect(event.loudness).toBeNull();
      expect(event.actorName.length).toBeGreaterThan(0);
    }
    const ids = events.map((event) => event.id);
    expect(ids).toEqual([...ids].sort((first, second) => first - second));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produces the same walks from the same seed", async () => {
    const firstRun = await runTicks(buildState(), 80);
    const secondRun = await runTicks(buildState(), 80);
    expect(secondRun).toEqual(firstRun);
  });

  it("replans a walk in progress after a restart", async () => {
    const state = buildState();
    await runTicks(state, 3);
    const walker = state.agents.find((agent) => agent.currentAction?.kind === "walk_to");
    expect(walker).toBeDefined();
    const [result] = await runTicks(state, 1);
    expect(result?.moves.some((move) => move.agentId === walker?.id)).toBe(true);
  });
});
