import { createAgentMemory } from "../memory/summaries";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorldEvent } from "@village/shared";
import { config } from "../config";
import { buildSeededWorld, loadSeedFile } from "../seeds";
import { loadItemCatalog } from "../items/load-items";
import { createDefaultSettings, createWorldState, toSavedWorld } from "../sim/world-state";
import { loadWorldMap } from "../world/map-loader";
import { IN_MEMORY_DATABASE, openDatabase, wipeDatabase, type Database } from "./database";
import {
  addTokenUsage,
  appendEvent,
  appendLlmCall,
  appendPersonalityChange,
  getTokenUsage,
  listLlmCalls,
  listPersonalityHistory,
  listRecentEvents,
} from "./log-repository";
import { loadWorld, saveWorld } from "./world-repository";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const map = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));
const seedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));
const items = loadItemCatalog(resolve(repositoryRoot, config.server.itemsPath), []);

function buildWorld() {
  return createWorldState(map, buildSeededWorld(seedFile, map, items), items);
}

function buildEvent(id: number): WorldEvent {
  return {
    id,
    tick: id * 2,
    actorId: "mara",
    actorName: "Mara",
    kind: "arrived",
    targetId: null,
    targetName: "bakery",
    place: "bakery",
    pos: { x: 4, y: 13 },
    description: "arrived at the bakery",
    loudness: null,
  };
}

function buildLlmCall(agentId: string, tick: number) {
  return {
    agentId,
    tick,
    kind: "decision" as const,
    model: "fake-model",
    prompt: "## Who you are\nMara",
    reply: '{"action":"wait"}',
    parsed: { action: "wait" },
    promptTokens: 120,
    completionTokens: 12,
    cacheReadTokens: 80,
    cacheWriteTokens: null,
    latencyMs: 340,
    error: null,
  };
}

describe("database repositories", () => {
  let database: Database;

  beforeEach(() => {
    database = openDatabase(IN_MEMORY_DATABASE);
  });
  afterEach(() => database.close());

  it("returns null when no world has been saved", () => {
    expect(loadWorld(database)).toBeNull();
  });

  it("round-trips the full world, replacing the previous save", () => {
    const state = buildWorld();
    state.random.next();
    const settings = { ...createDefaultSettings(), speed: 4 };
    saveWorld(database, toSavedWorld(state, settings));

    state.tick = 42;
    state.nextEventId = 7;
    state.agents = state.agents.slice(0, 2);
    state.agentMemories = {
      mara: {
        ...createAgentMemory(1),
        episodes: [{ level: "episode", startTick: 0, endTick: 2, text: "I got up." }],
        stream: [
          { text: "I woke up", tick: 3 },
          { text: "I swept the floor", tick: 5, count: 3, endTick: 9 },
        ],
      },
    };
    const saved = toSavedWorld(state, settings);
    saveWorld(database, saved);

    expect(loadWorld(database)).toEqual(saved);
  });

  it("keeps body changes, death and stats through a save", () => {
    const state = buildWorld();
    const [first] = state.agents;
    if (!first) throw new Error("no seed agents");
    state.agents[0] = {
      ...first,
      bodyChanges: { health: { fields: { current: 0 }, endsAtTick: null, sourceAgentId: null } },
      death: { tick: 5, cause: "starved", sourceAgentId: null },
    };
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    const loaded = loadWorld(database)?.agents[0];
    expect(loaded?.bodyChanges).toEqual(state.agents[0]?.bodyChanges);
    expect(loaded?.death).toEqual({ tick: 5, cause: "starved", sourceAgentId: null });
    expect(loaded?.body.strength).toBe(first.body.strength);
  });

  it("keeps an agent's person entries through a save", () => {
    const state = buildWorld();
    const [first, second] = state.agents;
    if (!first || !second) throw new Error("need two seed agents");
    state.agents[0] = {
      ...first,
      people: {
        [second.id]: {
          whatIThinkOfThem: "Reliable.",
          whatTheyThinkOfMe: "",
          whatIWantFromThem: "",
          whatTheyWantFromMe: "",
          misc: "",
        },
      },
    };
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    expect(loadWorld(database)?.agents[0]?.people).toEqual(state.agents[0]?.people);
  });

  it("refuses a save from before components existed and says to reset", () => {
    const state = buildWorld();
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    const [first] = state.agents;
    if (!first) throw new Error("no seed agents");
    const outdated: Partial<typeof first> = { ...first };
    delete outdated.bodyChanges;
    database
      .prepare("UPDATE agents SET data = ? WHERE id = ?")
      .run(JSON.stringify(outdated), first.id);
    expect(() => loadWorld(database)).toThrow(/make reset/);
  });

  it("refuses a saved memory in an older shape and says to reset", () => {
    saveWorld(database, toSavedWorld(buildWorld(), createDefaultSettings()));
    database
      .prepare("INSERT INTO agent_memories (agent_id, data) VALUES (?, ?)")
      .run("mara", JSON.stringify({ memories: [] }));
    expect(() => loadWorld(database)).toThrow(/make reset/);
  });

  it("refuses a save from before entities existed and says to reset", () => {
    saveWorld(database, toSavedWorld(buildWorld(), createDefaultSettings()));
    database.prepare("DELETE FROM meta WHERE key = 'nextEntityId'").run();
    expect(() => loadWorld(database)).toThrow(/make reset/);
  });

  it("recreates an entities table that still has the old state column", () => {
    const directory = mkdtempSync(join(tmpdir(), "village-old-save-"));
    try {
      const path = join(directory, "sim.db");
      const old = new BetterSqlite3(path);
      old.exec("CREATE TABLE entities (id TEXT PRIMARY KEY, state TEXT NOT NULL)");
      old.close();
      const reopened = openDatabase(path);
      const columns = reopened.prepare("PRAGMA table_info(entities)").all() as { name: string }[];
      reopened.close();
      expect(columns.map((column) => column.name)).toContain("changes");
      expect(columns.map((column) => column.name)).not.toContain("state");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("adds the cache token columns to an llm_calls table from before prompt caching", () => {
    const directory = mkdtempSync(join(tmpdir(), "village-old-calls-"));
    try {
      const path = join(directory, "sim.db");
      const old = new BetterSqlite3(path);
      old.exec(
        "CREATE TABLE llm_calls (id INTEGER PRIMARY KEY, agent_id TEXT, prompt_tokens INTEGER)",
      );
      old.close();
      const reopened = openDatabase(path);
      const columns = reopened.prepare("PRAGMA table_info(llm_calls)").all() as { name: string }[];
      reopened.close();
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["cache_read_tokens", "cache_write_tokens"]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps entities, their places and their changes through a save", () => {
    const state = buildWorld();
    const [first] = state.entities;
    if (!first) throw new Error("no entities");
    state.entities[0] = {
      ...first,
      changes: { closed: { fields: {}, endsAtTick: 9, sourceAgentId: "mara" } },
    };
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    const loaded = loadWorld(database);
    expect(loaded?.entities).toEqual(state.entities);
    expect(loaded?.nextEntityId).toBe(state.nextEntityId);
  });

  it("never reuses an event id already in the log after resuming", () => {
    const state = buildWorld();
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    appendEvent(database, buildEvent(1));
    appendEvent(database, buildEvent(2));
    expect(loadWorld(database)?.nextEventId).toBe(3);
  });

  it("lists the most recent events oldest first", () => {
    for (let id = 1; id <= 5; id++) appendEvent(database, buildEvent(id));
    expect(listRecentEvents(database, 3).map((event) => event.id)).toEqual([3, 4, 5]);
    expect(listRecentEvents(database, 3)[0]).toEqual(buildEvent(3));
  });

  it("stores LLM calls and lists an agent's newest first", () => {
    const firstId = appendLlmCall(database, buildLlmCall("mara", 1));
    appendLlmCall(database, buildLlmCall("edwin", 2));
    const thirdId = appendLlmCall(database, buildLlmCall("mara", 3));
    const calls = listLlmCalls(database, "mara", 20);
    expect(calls.map((call) => call.id)).toEqual([thirdId, firstId]);
    expect(calls[0]).toEqual({ id: thirdId, ...buildLlmCall("mara", 3) });
    expect(listLlmCalls(database, "mara", 1)).toHaveLength(1);
  });

  it("adds token usage per calendar day", () => {
    expect(getTokenUsage(database, "2026-11-10")).toBe(0);
    addTokenUsage(database, "2026-11-10", 500);
    expect(addTokenUsage(database, "2026-11-10", 250)).toBe(750);
    expect(getTokenUsage(database, "2026-11-11")).toBe(0);
  });

  it("records personality changes per agent", () => {
    const change = {
      agentId: "wren",
      tick: 10080,
      field: "extraversion" as const,
      oldValue: "0.6",
      newValue: "0.55",
      reason: "I kept to myself this week",
    };
    const id = appendPersonalityChange(database, change);
    expect(listPersonalityHistory(database, "wren")).toEqual([{ id, ...change }]);
    expect(listPersonalityHistory(database, "mara")).toEqual([]);
  });

  it("wipes everything on reset except the token usage", () => {
    const state = buildWorld();
    saveWorld(database, toSavedWorld(state, createDefaultSettings()));
    appendEvent(database, buildEvent(1));
    appendLlmCall(database, buildLlmCall("mara", 1));
    addTokenUsage(database, "2026-11-10", 500);
    wipeDatabase(database);
    expect(getTokenUsage(database, "2026-11-10")).toBe(500);
    expect(loadWorld(database)).toBeNull();
    expect(listRecentEvents(database, 10)).toEqual([]);
    expect(listLlmCalls(database, "mara", 10)).toEqual([]);
  });
});
