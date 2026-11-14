import { describe, expect, it } from "vitest";
import { IN_MEMORY_DATABASE, openDatabase } from "../db/database";
import { loadWorld, saveWorld } from "../db/world-repository";
import { createFakeResponder } from "../llm/fake-responder";
import { createTestSim } from "./test-sim";
import { createDefaultSettings, restoreWorldState, takeFreshId, toSavedWorld } from "./world-state";

describe("persistence", () => {
  it("state survives save and restore including every agent's stream", async () => {
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
    expect(restored.state.agentMemories).toEqual(sim.state.agentMemories);
    expect(restored.state.agentMemories.mara?.stream.length).toBeGreaterThan(5);
    database.close();
  });

  it("keeps the fresh id counter through a save, so no id is given twice", () => {
    const sim = createTestSim({ responder: createFakeResponder() });
    const before = takeFreshId(sim.state);
    const database = openDatabase(IN_MEMORY_DATABASE);
    saveWorld(database, toSavedWorld(sim.state, createDefaultSettings()));
    const loaded = loadWorld(database);
    if (loaded === null) throw new Error("nothing was saved");
    const { state } = restoreWorldState(loaded, sim.state.map, sim.state.items);
    const afterLoad = takeFreshId(state);
    expect(afterLoad).not.toBe(before);
    expect(afterLoad).toBe(takeFreshId(sim.state));
    database.close();
  });

  it("refuses a save holding an entity whose definition is gone from items.json", async () => {
    const sim = createTestSim({ responder: createFakeResponder() });
    const saved = toSavedWorld(sim.state, createDefaultSettings());
    const [first, ...rest] = saved.entities;
    if (!first) throw new Error("the test world has no entities");
    const orphaned = { ...saved, entities: [{ ...first, definitionId: "windmill" }, ...rest] };
    expect(() => restoreWorldState(orphaned, sim.state.map, sim.state.items)).toThrow(
      /windmill.*make reset/,
    );
  });
});
