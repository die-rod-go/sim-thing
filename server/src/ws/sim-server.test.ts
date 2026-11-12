import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { ServerMessage } from "@village/shared";
import { IN_MEMORY_DATABASE, openDatabase, type Database } from "../db/database";
import { InMemoryTokenUsageStore, TokenBudget } from "../llm/token-budget";
import { createItemEditor } from "../item-editor";
import { createMapEditor } from "../map-editor";
import { createSeedEditor } from "../seed-editor";
import { SimLoop } from "../sim/loop";
import { buildEmptySeededWorld, loadTestItems } from "../sim/test-sim";
import { ManualScheduler } from "../sim/manual-scheduler";
import {
  createDefaultSettings,
  createEmptyTickResult,
  createWorldState,
  type SimSettings,
} from "../sim/world-state";
import { startSimServer, WEBSOCKET_PATH, type SimServer } from "./sim-server";

const agent = {
  id: "mara",
  name: "Mara",
  place: "bakery",
  pos: { x: 0, y: 0 },
  personality: {
    traits: {
      extraversion: 0,
      agreeableness: 0,
      conscientiousness: 0,
      neuroticism: 0,
      openness: 0,
    },
    core: "",
    selfImage: "",
  },
  body: { sleepRecoveryPerHour: 0.15, strength: 0.5, agility: 0.5 },
  profession: "baker",
  needs: { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 },
  bodyChanges: {},
  starvingSinceTick: null,
  death: null,
  mood: "",
  goals: [],
  dailyPlan: "",
  intention: "",
  currentAction: null,
  workingMemory: [],
  awareness: {},
  dossiers: {},
  lastThought: null,
};

const seedAgent = {
  id: "mara",
  name: "Mara",
  profession: "baker",
  traits: agent.personality.traits,
  core: "",
  selfImage: "",
  sleepRecoveryPerHour: 0.15,
  strength: 0.5,
  agility: 0.5,
  inventory: { coin: 30 },
  mood: "",
  goals: [],
  peopleNotes: {},
};

/** Collects messages from one client and lets a test wait for a given type. */
class TestClient {
  readonly received: ServerMessage[] = [];
  private waiters: { type: string; resolve: (message: ServerMessage) => void }[] = [];

  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      this.received.push(message);
      const waiter = this.waiters.find((candidate) => candidate.type === message.type);
      if (waiter) {
        this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
        waiter.resolve(message);
      }
    });
  }

  waitFor<Type extends ServerMessage["type"]>(
    type: Type,
  ): Promise<Extract<ServerMessage, { type: Type }>> {
    const already = this.received.find((message) => message.type === type);
    if (already) {
      this.received.splice(this.received.indexOf(already), 1);
      return Promise.resolve(already as Extract<ServerMessage, { type: Type }>);
    }
    return new Promise((resolveMessage) => {
      this.waiters.push({
        type,
        resolve: (message) => {
          this.received.splice(this.received.indexOf(message), 1);
          resolveMessage(message as Extract<ServerMessage, { type: Type }>);
        },
      });
    });
  }

  send(message: unknown): void {
    this.socket.send(typeof message === "string" ? message : JSON.stringify(message));
  }
}

describe("sim WebSocket server", () => {
  let database: Database;
  let loop: SimLoop;
  let server: SimServer;
  let settings: SimSettings;
  let resetCount: number;
  let tokenBudget: TokenBudget;
  let seedDirectory: string;
  let seedFilePath: string;
  const clients: TestClient[] = [];

  async function connect(): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WEBSOCKET_PATH}`);
    const client = new TestClient(socket);
    clients.push(client);
    await new Promise((resolveOpen) => socket.once("open", resolveOpen));
    return client;
  }

  beforeEach(async () => {
    database = openDatabase(IN_MEMORY_DATABASE);
    const map = {
      grid: { width: 2, height: 1, isWall: [false, false] },
      places: [],
      placements: [],
      startTiles: { mara: { x: 0, y: 0 } },
    };
    const items = loadTestItems();
    const state = createWorldState(
      map,
      buildEmptySeededWorld({ agents: [structuredClone(agent)] }),
      items,
    );
    seedDirectory = mkdtempSync(join(tmpdir(), "village-seeds-"));
    seedFilePath = join(seedDirectory, "agents.json");
    writeFileSync(seedFilePath, JSON.stringify({ agents: [seedAgent] }));
    loop = new SimLoop({
      state,
      advanceTick: (current) => {
        const result = createEmptyTickResult(current.tick);
        result.moves.push({ agentId: "mara", pos: { x: 1, y: 0 }, place: "bakery" });
        return Promise.resolve(result);
      },
      scheduler: new ManualScheduler(),
      isPaused: true,
    });
    settings = createDefaultSettings();
    resetCount = 0;
    tokenBudget = new TokenBudget(new InMemoryTokenUsageStore(), { dailyTokenBudget: 1000 });
    server = await startSimServer({
      port: 0,
      loop,
      database,
      settings,
      countInFlightLlmCalls: () => 0,
      tokenBudget,
      findPauseReason: () => (tokenBudget.isOverBudget() ? "Daily token budget reached" : null),
      seedEditor: createSeedEditor({ seedFilePath, getMap: () => map, getItems: () => items }),
      itemEditor: createItemEditor({
        itemFilePath: join(seedDirectory, "items.json"),
        seedFilePath,
        getMap: () => map,
      }),
      mapEditor: createMapEditor({
        mapFilePath: join(seedDirectory, "village.json"),
        itemFilePath: join(seedDirectory, "items.json"),
        seedFilePath,
      }),
      resetWorld: () => {
        resetCount += 1;
        return Promise.resolve();
      },
    });
    loop.start();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.socket.close();
    await server.close();
    database.close();
    rmSync(seedDirectory, { recursive: true, force: true });
  });

  it("sends a snapshot on connect", async () => {
    const client = await connect();
    const snapshot = await client.waitFor("snapshot");
    expect(snapshot.clock).toEqual({ tick: 0, isPaused: true, speed: 1 });
    expect(snapshot.agents.map((candidate) => candidate.id)).toEqual(["mara"]);
    expect(snapshot.stats).toMatchObject({ inFlightLlmCalls: 0, tokensToday: 0 });
  });

  it("steps one tick and streams the move and the tick", async () => {
    const client = await connect();
    await client.waitFor("snapshot");
    client.send({ type: "step" });
    expect(await client.waitFor("agent_moved")).toMatchObject({
      agentId: "mara",
      pos: { x: 1, y: 0 },
    });
    expect((await client.waitFor("tick")).tick).toBe(1);
  });

  it("broadcasts pause changes and settings to every client", async () => {
    const first = await connect();
    const second = await connect();
    first.send({ type: "resume" });
    expect(await second.waitFor("paused")).toEqual({
      type: "paused",
      isPaused: false,
      reason: null,
    });
    first.send({ type: "set_speed", speed: 4 });
    expect(await second.waitFor("settings")).toMatchObject({ speed: 4 });
    expect(settings.speed).toBe(4);
    first.send({ type: "update_settings", dailyTokenBudget: 5000 });
    expect(await second.waitFor("settings")).toMatchObject({ dailyTokenBudget: 5000 });
    expect(tokenBudget.dailyTokenBudget).toBe(5000);
  });

  it("stays paused with a reason while over the token budget, and resumes once under it", async () => {
    const client = await connect();
    await client.waitFor("snapshot");
    tokenBudget.addTokens(2000);
    client.send({ type: "resume" });
    expect(await client.waitFor("paused")).toEqual({
      type: "paused",
      isPaused: true,
      reason: "Daily token budget reached",
    });
    expect(loop.isPaused()).toBe(true);
    client.send({ type: "update_settings", dailyTokenBudget: 5000 });
    await client.waitFor("settings");
    client.send({ type: "resume" });
    expect(await client.waitFor("paused")).toMatchObject({ isPaused: false });
  });

  it("answers inspect_agent with the agent's detail", async () => {
    const client = await connect();
    client.send({ type: "inspect_agent", agentId: "mara" });
    const detail = await client.waitFor("agent_detail");
    expect(detail).toMatchObject({ agentId: "mara", llmCalls: [] });
    expect(detail.perceptionView?.visibleTiles).toEqual([0, 1]);
  });

  it("ignores invalid messages and keeps serving", async () => {
    const client = await connect();
    await client.waitFor("snapshot");
    client.send("not json");
    client.send({ type: "set_speed", speed: -2 });
    client.send({ type: "reset" });
    await client.waitFor("snapshot");
    expect(resetCount).toBe(1);
    expect(loop.getSpeed()).toBe(1);
  });

  it("sends the seed file and its rules to the character editor", async () => {
    const client = await connect();
    client.send({ type: "load_seed_file" });
    const message = await client.waitFor("seed_file");
    expect(message.loadError).toBeNull();
    expect(message.seedFile?.agents[0]?.name).toBe("Mara");
    expect(message.rules.agentsWithStartTiles).toEqual(["mara"]);
    expect(message.rules.inventoryItems).toContainEqual({ id: "bread", name: "bread" });
    expect(message.newAgentTemplate.inventory).toMatchObject({ coin: 30 });
  });

  it("saves a valid seed file and resets the world when asked", async () => {
    const client = await connect();
    await client.waitFor("snapshot");
    const renamed = { ...seedAgent, name: "Marga", id: "marga" };
    client.send({
      type: "save_seed_file",
      seedFile: { agents: [renamed] },
      shouldResetWorld: true,
    });
    const reply = await client.waitFor("seed_file_saved");
    expect(reply).toMatchObject({ isSaved: true, isWorldReset: true });
    expect(resetCount).toBe(1);
    const written = JSON.parse(readFileSync(seedFilePath, "utf8")) as {
      agents: { name: string }[];
    };
    expect(written.agents.map((saved) => saved.name)).toEqual(["Marga"]);
  });

  it("refuses to save a seed file with errors and leaves the file alone", async () => {
    const client = await connect();
    const nameless = { ...seedAgent, name: "" };
    client.send({
      type: "save_seed_file",
      seedFile: { agents: [nameless] },
      shouldResetWorld: true,
    });
    const reply = await client.waitFor("seed_file_saved");
    expect(reply).toMatchObject({ isSaved: false, isWorldReset: false });
    expect(reply.problems.map((problem) => problem.field)).toContain("name");
    expect(resetCount).toBe(0);
    expect(readFileSync(seedFilePath, "utf8")).toContain('"name":"Mara"');
  });

  it("answers the item editor's save with the problems that stopped it", async () => {
    const client = await connect();
    client.send({ type: "save_item_file", itemFile: { definitions: "none" } });
    const reply = await client.waitFor("item_file_saved");
    expect(reply.isSaved).toBe(false);
    expect(reply.problems.length).toBeGreaterThan(0);
  });
});
