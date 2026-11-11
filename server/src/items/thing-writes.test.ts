import { readAgentHealth } from "@village/shared";
import { describe, expect, it } from "vitest";
import { startSleep } from "../economy/sleep";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  buildCombatSim,
  contextOf,
  entityThing,
  handOver,
  place,
  readFieldOf,
  readHealth,
} from "../sim/combat-test-kit";
import type { TestSim } from "../sim/test-sim";
import { replaceAgent } from "../sim/world-access";
import { addComponent, removeComponent, replaceDefinition, writeField } from "./thing-writes";
import { createEntity, findEntity } from "./entity-store";
import { readComponents, readThingChanges, type ThingRef } from "./things";

const HEALTH = "health.current";
const OPEN_GROUND = { x: 23, y: 19 };
const TOBIAS: ThingRef = { kind: "agent", agentId: "tobias" };

function setUp(): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  return sim;
}

function placeBench(sim: TestSim) {
  const place = sim.agent("mara").place;
  return createEntity(sim.state, "bench", { kind: "tile", place, pos: OPEN_GROUND }, "park bench");
}

describe("writing an entity's fields", () => {
  it("stores a changed field as a difference from the definition", () => {
    const sim = setUp();
    const knife = entityThing(handOver(sim, "mara", "knife"));
    writeField(contextOf(sim), knife, HEALTH, 3);
    expect(readFieldOf(sim, knife, HEALTH)).toBe(3);
    expect(readThingChanges(sim.state, knife)?.health?.fields).toEqual({ current: 3 });
  });

  it("marks the entity changed when it writes", () => {
    const sim = setUp();
    const knife = handOver(sim, "mara", "knife");
    const context = contextOf(sim);
    writeField(context, entityThing(knife), HEALTH, 3);
    expect(context.result.changedEntityIds).toContain(knife.id);
  });

  it("clamps a value to the field's literal bound", () => {
    const sim = setUp();
    const knife = entityThing(handOver(sim, "mara", "knife"));
    writeField(contextOf(sim), knife, "holdable.kilograms", -5);
    expect(readFieldOf(sim, knife, "holdable.kilograms")).toBe(0);
  });

  it("clamps a value to a sibling field", () => {
    const sim = setUp();
    const knife = entityThing(handOver(sim, "mara", "knife"));
    writeField(contextOf(sim), knife, HEALTH, 99);
    expect(readFieldOf(sim, knife, HEALTH)).toBe(4);
    writeField(contextOf(sim), knife, "health.max", 2);
    writeField(contextOf(sim), knife, HEALTH, 99);
    expect(readFieldOf(sim, knife, HEALTH)).toBe(2);
  });

  it("drops an override that equals the definition value", () => {
    const sim = setUp();
    const knife = handOver(sim, "mara", "knife");
    writeField(contextOf(sim), entityThing(knife), HEALTH, 3);
    writeField(contextOf(sim), entityThing(knife), HEALTH, 4);
    expect(findEntity(sim.state, knife.id).changes).toEqual({});
  });

  it("does nothing for a component the entity lacks", () => {
    const sim = setUp();
    const knife = handOver(sim, "mara", "knife");
    const context = contextOf(sim);
    writeField(context, entityThing(knife), "stock.amount", 3);
    expect(findEntity(sim.state, knife.id).changes).toEqual({});
    expect(context.result.changedEntityIds).toEqual([]);
  });
});

describe("adding and removing components on an entity", () => {
  it("adds a component the definition lacks, ending when asked", () => {
    const sim = setUp();
    const bench = entityThing(placeBench(sim));
    const isNew = addComponent(contextOf(sim), bench, "burning", {
      minutes: 5,
      sourceAgentId: "mara",
    });
    expect(isNew).toBe(true);
    expect(readComponents(sim.state, bench)).toHaveProperty("burning");
    expect(readThingChanges(sim.state, bench)?.burning).toEqual({
      fields: {},
      endsAtTick: sim.state.tick + 1 + 5,
      sourceAgentId: "mara",
    });
  });

  it("extends a timed component to the later end and never shortens it", () => {
    const sim = setUp();
    const bench = entityThing(placeBench(sim));
    addComponent(contextOf(sim), bench, "burning", { minutes: 5, sourceAgentId: null });
    const isNewAgain = addComponent(contextOf(sim), bench, "burning", {
      minutes: 10,
      sourceAgentId: "mara",
    });
    const longEnd = readThingChanges(sim.state, bench)?.burning?.endsAtTick;
    expect(isNewAgain).toBe(false);
    expect(longEnd).toBe(sim.state.tick + 1 + 10);
    addComponent(contextOf(sim), bench, "burning", { minutes: 2, sourceAgentId: null });
    expect(readThingChanges(sim.state, bench)?.burning?.endsAtTick).toBe(longEnd);
    expect(readThingChanges(sim.state, bench)?.burning?.sourceAgentId).toBe("mara");
  });

  it("lets a component with no end beat any end", () => {
    const sim = setUp();
    const bench = entityThing(placeBench(sim));
    addComponent(contextOf(sim), bench, "burning", { minutes: 5, sourceAgentId: null });
    addComponent(contextOf(sim), bench, "burning", { minutes: null, sourceAgentId: null });
    expect(readThingChanges(sim.state, bench)?.burning?.endsAtTick).toBeNull();
  });

  it("removes an added component and reports whether there was one", () => {
    const sim = setUp();
    const bench = entityThing(placeBench(sim));
    addComponent(contextOf(sim), bench, "burning", { minutes: 5, sourceAgentId: null });
    expect(removeComponent(contextOf(sim), bench, "burning")).toBe(true);
    expect(readThingChanges(sim.state, bench)).toEqual({});
    expect(removeComponent(contextOf(sim), bench, "burning")).toBe(false);
  });

  it("removes a component the definition has by recording the removal", () => {
    const sim = setUp();
    const bench = entityThing(placeBench(sim));
    expect(removeComponent(contextOf(sim), bench, "flammable")).toBe(true);
    expect(readComponents(sim.state, bench)).not.toHaveProperty("flammable");
    expect(readThingChanges(sim.state, bench)).toEqual({ flammable: null });
  });
});

describe("replacing an entity's definition", () => {
  it("clears its changes and its label and keeps where it is", () => {
    const sim = setUp();
    const bench = placeBench(sim);
    addComponent(contextOf(sim), entityThing(bench), "burning", {
      minutes: 5,
      sourceAgentId: null,
    });
    writeField(contextOf(sim), entityThing(bench), HEALTH, 1);
    replaceDefinition(contextOf(sim), bench.id, "shards");
    const replaced = findEntity(sim.state, bench.id);
    expect(replaced.definitionId).toBe("shards");
    expect(replaced.changes).toEqual({});
    expect(replaced.label).toBeNull();
    expect(replaced.location).toEqual(bench.location);
  });
});

describe("writing an agent's body", () => {
  it("stores body changes like an entity's", () => {
    const sim = setUp();
    writeField(contextOf(sim), TOBIAS, HEALTH, 0.5);
    expect(sim.agent("tobias").bodyChanges.health?.fields).toEqual({ current: 0.5 });
    writeField(contextOf(sim), TOBIAS, HEALTH, 1);
    expect(sim.agent("tobias").bodyChanges).toEqual({});
  });

  it("clamps healing to the body's own maximum", () => {
    const sim = setUp();
    writeField(contextOf(sim), TOBIAS, HEALTH, 0.5);
    writeField(contextOf(sim), TOBIAS, HEALTH, 7);
    expect(readHealth(sim, "tobias")).toBe(1);
  });

  it("adds, extends and removes a component on the body", () => {
    const sim = setUp();
    const isNew = addComponent(contextOf(sim), TOBIAS, "bleeding", {
      minutes: 5,
      sourceAgentId: "mara",
    });
    expect(isNew).toBe(true);
    const firstEnd = sim.agent("tobias").bodyChanges.bleeding?.endsAtTick ?? 0;
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: 20, sourceAgentId: null });
    expect(sim.agent("tobias").bodyChanges.bleeding?.endsAtTick).toBeGreaterThan(firstEnd);
    expect(removeComponent(contextOf(sim), TOBIAS, "bleeding")).toBe(true);
    expect(sim.agent("tobias").bodyChanges).toEqual({});
  });
});

describe("an agent's health field", () => {
  it("wakes a sleeper when it is lowered", () => {
    const sim = setUp();
    const slept = startSleep(sim.agent("tobias"), "grass", sim.state.tick);
    if (!slept.isSuccess) throw new Error(slept.reason);
    replaceAgent(sim.state, slept.agent);
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 0.8);
    expect(sim.agent("tobias").currentAction).toBeNull();
    expect(context.result.events.map((event) => event.kind)).toContain("woke");
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I woke up in pain/);
  });

  it("settles death when it reaches 0, with the given cause", () => {
    const sim = setUp();
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 0, { killed: "stabbed by {actor}", sourceAgentId: "mara" });
    expect(sim.agent("tobias").death).toEqual({
      tick: sim.state.tick,
      cause: "stabbed by Mara",
      sourceAgentId: "mara",
    });
    expect(readAgentHealth(sim.state.items, sim.agent("tobias"))).toBe(0);
    expect(context.result.events.map((event) => event.kind)).toContain("died");
  });

  it("raises without waking or settling anything", () => {
    const sim = setUp();
    writeField(contextOf(sim), TOBIAS, HEALTH, 0.5);
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 0.9);
    expect(readHealth(sim, "tobias")).toBeCloseTo(0.9, 9);
    expect(context.result.events).toEqual([]);
  });

  it("ignores writes once the agent is dead", () => {
    const sim = setUp();
    writeField(contextOf(sim), TOBIAS, HEALTH, 0);
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 1);
    expect(readHealth(sim, "tobias")).toBe(0);
    expect(context.result.events).toEqual([]);
    expect(sim.agent("tobias").death).not.toBeNull();
  });
});
