import { describe, expect, it } from "vitest";
import { tileIndex } from "../world/types";
import {
  SQUARE,
  buildCombatSim,
  contextOf,
  entityThing,
  handOver,
  place,
} from "../sim/combat-test-kit";
import { startWalk } from "../sim/walk-start";
import { advanceWalk } from "../sim/walking";
import { findEntityByLabel, type TestSim } from "../sim/test-sim";
import { buildPerceptionWorld, buildWalkingGrid } from "../sim/world-access";
import { findEntity } from "./entity-store";
import { addComponent } from "./thing-writes";
import {
  blocksMovement,
  blocksSight,
  isLyingWhenOnTile,
  isShownWhenCarried,
  mufflesSound,
} from "./world-physics";

const BEHIND_BAKERY_DOOR = { x: 6, y: 14 };
const TICKS_TO_CROSS = 20;

function setUp(): TestSim {
  const sim = buildCombatSim(["mara"]);
  place(sim, { mara: SQUARE });
  return sim;
}

function closeDoor(sim: TestSim) {
  const door = findEntityByLabel(sim.state, "bakery door");
  addComponent(contextOf(sim), entityThing(door), "closed", { minutes: null });
  return findEntity(sim.state, door.id);
}

function tileOfEntity(sim: TestSim, label: string): number {
  const { location } = findEntityByLabel(sim.state, label);
  if (location.kind !== "tile") throw new Error(`${label} is not on a tile`);
  return tileIndex(sim.state.map.grid, location.pos);
}

describe("what the world settings make of an entity", () => {
  it("lets an open door pass sight, sound and walking", () => {
    const sim = setUp();
    const door = findEntityByLabel(sim.state, "bakery door");
    expect(blocksSight(sim.state, door)).toBe(false);
    expect(mufflesSound(sim.state, door)).toBe(false);
    expect(blocksMovement(sim.state, door)).toBe(false);
  });

  it("makes a closed door block sight, muffle sound and block walking", () => {
    const sim = setUp();
    const door = closeDoor(sim);
    expect(blocksSight(sim.state, door)).toBe(true);
    expect(mufflesSound(sim.state, door)).toBe(true);
    expect(blocksMovement(sim.state, door)).toBe(true);
  });

  it("only counts sight, sound and walking for an entity on a tile", () => {
    const sim = setUp();
    const door = closeDoor(sim);
    const carried = { ...door, location: { kind: "inside" as const, holderId: "mara" } };
    expect(blocksSight(sim.state, carried)).toBe(false);
    expect(mufflesSound(sim.state, carried)).toBe(false);
    expect(blocksMovement(sim.state, carried)).toBe(false);
  });

  it("puts a closed door's tile in the perception world's sight and sound sets", () => {
    const sim = setUp();
    const doorTile = tileOfEntity(sim, "bakery door");
    const before = buildPerceptionWorld(sim.state);
    expect(before.sightBlockingTiles.has(doorTile)).toBe(false);
    expect(before.muffledTiles.has(doorTile)).toBe(false);
    closeDoor(sim);
    const after = buildPerceptionWorld(sim.state);
    expect(after.sightBlockingTiles.has(doorTile)).toBe(true);
    expect(after.muffledTiles.has(doorTile)).toBe(true);
  });

  it("walls off a solid object for walking but leaves a closed door passable", () => {
    const sim = setUp();
    closeDoor(sim);
    const grid = buildWalkingGrid(sim.state);
    expect(grid.isWall[tileOfEntity(sim, "bakery door")]).toBe(false);
    expect(grid.isWall[tileOfEntity(sim, "oven")]).toBe(true);
  });

  it("shows conspicuous things when carried and treats holdable ones as lying about", () => {
    const sim = setUp();
    const knife = handOver(sim, "mara", "knife");
    const oven = findEntityByLabel(sim.state, "oven");
    expect(isShownWhenCarried(sim.state, knife)).toBe(true);
    expect(isShownWhenCarried(sim.state, oven)).toBe(false);
    expect(isLyingWhenOnTile(sim.state, oven)).toBe(false);
    const bread = sim.state.entities.find((entity) => entity.definitionId === "bread");
    expect(bread && isLyingWhenOnTile(sim.state, bread)).toBe(true);
  });
});

describe("walking through a closed door", () => {
  it("opens it in passing, seen as the verb finishing", () => {
    const sim = buildCombatSim(["mara"]);
    sim.placeAgent("mara", BEHIND_BAKERY_DOOR);
    const door = closeDoor(sim);
    // One context per tick, as the loop makes: a walker steps at most once per tick's result.
    const contexts = [contextOf(sim)];
    startWalk(contexts[0]!, "mara", { kind: "place", placeName: "town square" }, null);
    for (let tick = 0; tick < TICKS_TO_CROSS; tick += 1) {
      const context = contextOf(sim);
      contexts.push(context);
      advanceWalk(context, "mara");
      sim.state.tick += 1;
    }
    const events = contexts.flatMap((context) => context.result.events);
    const changedEntityIds = contexts.flatMap((context) => context.result.changedEntityIds);
    expect(Object.hasOwn(findEntity(sim.state, door.id).changes, "closed")).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "action_finished",
        description: "opened the bakery door",
        loudness: 3,
      }),
    );
    expect(changedEntityIds).toContain(door.id);
    expect(sim.agent("mara").place).toBe("town square");
  });
});
