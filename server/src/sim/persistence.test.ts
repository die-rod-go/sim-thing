import { describe, expect, it } from "vitest";
import { IN_MEMORY_DATABASE, openDatabase } from "../db/database";
import { loadWorld, saveWorld } from "../db/world-repository";
import { createFakeResponder } from "../llm/fake-responder";
import { createTestSim } from "./test-sim";
import { createDefaultSettings, restoreWorldState, toSavedWorld } from "./world-state";

describe("persistence", () => {
  it("state survives save and restore including memory ids", async () => {
    const sim = createTestSim({ responder: createFakeResponder() });
    await sim.advance(120);
    const database = openDatabase(IN_MEMORY_DATABASE);
    const settings = { ...createDefaultSettings(), speed: 4 };
    const saved = toSavedWorld(sim.state, settings);
    saveWorld(database, saved);

    const loaded = loadWorld(database);
    expect(loaded).not.toBeNull();
    const restored = restoreWorldState(loaded!, sim.state.map, sim.state.items);
    expect(toSavedWorld(restored.state, restored.settings)).toEqual(
      JSON.parse(JSON.stringify(saved)),
    );
    expect(restored.state.memoryIds.getState()).toBe(sim.state.memoryIds.getState());
    const existingIds = new Set(restored.state.memoryStore.all().map((memory) => memory.id));
    expect(existingIds.size).toBeGreaterThan(30);
    const nextId = restored.state.memoryIds.nextId("mara", restored.state.tick);
    expect(existingIds.has(nextId)).toBe(false);
    expect(sim.state.memoryIds.nextId("mara", sim.state.tick)).toBe(nextId);
    database.close();
  });

  it("refuses a save holding an entity whose definition is gone from items.json", async () => {
    const sim = createTestSim({ responder: createFakeResponder() });
    const saved = toSavedWorld(sim.state, createDefaultSettings());
    const [first, ...rest] = saved.entities;
    if (!first) throw new Error("the test world has no entities");
    const orphaned = { ...saved, entities: [{ ...first, definitionId: "anvil" }, ...rest] };
    expect(() => restoreWorldState(orphaned, sim.state.map, sim.state.items)).toThrow(
      /anvil.*make reset/,
    );
  });
});
