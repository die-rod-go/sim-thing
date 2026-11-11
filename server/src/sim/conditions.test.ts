import { buildItemCatalog, parseItemFile, type Position } from "@village/shared";
import { describe, expect, it } from "vitest";
import { createEntity, findEntityIfPresent } from "../items/entity-store";
import { computeConditionEndTick } from "../status/conditions";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  aimWith,
  buildCombatSim,
  contextOf,
  finish,
  fixRolls,
  handOver,
  place,
} from "./combat-test-kit";
import { advanceConditions, endCondition, startCondition } from "./conditions";
import type { EffectSubjectRef } from "./effects/effect-run";
import { applyEffect } from "./effects/effect-registry";
import type { TestSim } from "./test-sim";
import type { TickResult } from "./world-state";
import { replaceAgent } from "./world-access";

const TOBIAS: EffectSubjectRef = { kind: "agent", agentId: "tobias" };
const NEVER_ROLLS = 0.99;
/** Away from the square's bench, board and the agents. */
const OPEN_GROUND = { x: 23, y: 19 };

/** Runs the conditions phase of `count` ticks, returning each tick's result. */
function runTicks(sim: TestSim, count: number): TickResult[] {
  const results: TickResult[] = [];
  for (let tick = 0; tick < count; tick += 1) {
    sim.state.tick += 1;
    const context = contextOf(sim);
    advanceConditions(context);
    results.push(context.result);
  }
  return results;
}

function start(sim: TestSim, subject: EffectSubjectRef, name: string, sourceAgentId = "mara") {
  const context = contextOf(sim);
  startCondition(context, subject, name, { sourceAgentId });
  return context.result;
}

function conditionNames(sim: TestSim, agentId: string): string[] {
  return sim.agent(agentId).conditions.map((condition) => condition.name);
}

function addConditions(sim: TestSim, conditions: unknown[]): void {
  const file = sim.state.items.file;
  sim.state.items = buildItemCatalog(
    parseItemFile({ ...file, conditions: [...file.conditions, ...conditions] }),
  );
}

function setUp(): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  fixRolls(sim, NEVER_ROLLS);
  return sim;
}

/** "drenched" leaves its carrier wet when it ends. */
function setUpWithDrenched(): TestSim {
  const sim = setUp();
  addConditions(sim, [
    {
      name: "drenched",
      words: "drenched",
      defaultMinutes: 2,
      onEnd: [{ type: "add_condition", condition: "wet" }],
    },
  ]);
  return sim;
}

function placeThing(sim: TestSim, definitionId: string, pos: Position) {
  const place = sim.agent("mara").place;
  return createEntity(sim.state, definitionId, { kind: "tile", place, pos });
}

describe("conditions", () => {
  it("runs a condition's effects once per sim-minute for as long as it lasts", () => {
    const sim = setUp();
    start(sim, TOBIAS, "bleeding");
    runTicks(sim, 25);
    expect(sim.agent("tobias").health).toBeCloseTo(1 - 20 * 0.01, 9);
    expect(conditionNames(sim, "tobias")).toEqual([]);
  });

  it("counts a condition's length in minutes, whatever a tick lasts", () => {
    expect(computeConditionEndTick(20, 100, 1)).toBe(121);
    expect(computeConditionEndTick(20, 100, 5)).toBe(105);
    expect(computeConditionEndTick(null, 100, 5)).toBeNull();
  });

  it("extends a condition added again to the later end instead of stacking it", () => {
    const sim = setUp();
    start(sim, TOBIAS, "bleeding");
    const firstEnd = sim.agent("tobias").conditions[0]?.endsAtTick;
    runTicks(sim, 10);
    const restarted = start(sim, TOBIAS, "bleeding");
    expect(sim.agent("tobias").conditions).toHaveLength(1);
    expect(sim.agent("tobias").conditions[0]?.endsAtTick).toBe((firstEnd ?? 0) + 10);
    expect(restarted.events).toEqual([]);
    runTicks(sim, 1);
    expect(sim.agent("tobias").health).toBeCloseTo(1 - 11 * 0.01, 9);
  });

  it("never shortens a condition that is added again for less time", () => {
    const sim = setUp();
    start(sim, TOBIAS, "bleeding");
    const firstEnd = sim.agent("tobias").conditions[0]?.endsAtTick;
    startCondition(contextOf(sim), TOBIAS, "bleeding", { minutes: 2, sourceAgentId: null });
    expect(sim.agent("tobias").conditions[0]?.endsAtTick).toBe(firstEnd);
  });

  it("lasts until something removes it when it has no length", () => {
    const sim = setUp();
    start(sim, TOBIAS, "poisoned");
    runTicks(sim, 200);
    expect(conditionNames(sim, "tobias")).toEqual(["poisoned"]);
    endCondition(contextOf(sim), TOBIAS, "poisoned");
    expect(conditionNames(sim, "tobias")).toEqual([]);
  });

  it("is seen starting and ending, once each, while the agent carrying it notices", () => {
    const sim = setUp();
    const started = start(sim, TOBIAS, "bleeding");
    expect(started.events.map((event) => event.description)).toEqual(["started bleeding"]);
    const results = runTicks(sim, 25);
    const events = results.flatMap((result) => result.events);
    expect(events.map((event) => event.description)).toEqual(["stopped bleeding"]);
    expect(events[0]?.kind).toBe("condition_ended");
  });

  it("files a fire as caught and stopped, not every minute it burns", () => {
    const sim = setUp();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const benchRef: EffectSubjectRef = { kind: "entity", entityId: bench.id };
    const started = start(sim, benchRef, "burning");
    expect(started.events.map((event) => [event.kind, event.actorName])).toEqual([
      ["caught_fire", "the bench"],
    ]);
    const events = runTicks(sim, 40).flatMap((result) => result.events);
    expect(events.map((event) => event.kind)).toEqual(["stopped_burning"]);
  });

  it("runs onEnd effects when it runs out", () => {
    const sim = setUpWithDrenched();
    start(sim, TOBIAS, "drenched");
    runTicks(sim, 4);
    expect(conditionNames(sim, "tobias")).toEqual(["wet"]);
  });

  it("runs onEnd effects when it is removed", () => {
    const sim = setUpWithDrenched();
    start(sim, TOBIAS, "drenched");
    endCondition(contextOf(sim), TOBIAS, "drenched");
    expect(conditionNames(sim, "tobias")).toEqual(["wet"]);
  });

  it("drops a thing's conditions without onEnd when it is transformed", () => {
    const sim = setUpWithDrenched();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const jarRef: EffectSubjectRef = { kind: "entity", entityId: jar.id };
    start(sim, jarRef, "drenched");
    const context = contextOf(sim);
    const reactionRun = {
      context,
      verb: null,
      run: null,
      text: "",
      self: jarRef,
      sourceAgentId: null,
      reactionDepth: 0,
    };
    applyEffect(reactionRun, { type: "transform", into: "shards" });
    expect(findEntityIfPresent(sim.state, jar.id)?.state.conditions).toEqual([]);
  });

  it("burns out on its own: the burn damage sends no fire back to the burning thing", () => {
    const sim = setUp();
    fixRolls(sim, 0);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    start(sim, { kind: "entity", entityId: bench.id }, "burning");
    runTicks(sim, 35);
    const burned = findEntityIfPresent(sim.state, bench.id);
    expect(burned?.state.conditions).toEqual([]);
    expect(burned?.state.durability).toBeLessThan(1);
  });

  it("names a death from a condition after whoever caused it", () => {
    const sim = setUp();
    replaceAgent(sim.state, { ...sim.agent("tobias"), health: 0.05 });
    start(sim, TOBIAS, "bleeding", "mara");
    runTicks(sim, 10);
    expect(sim.agent("tobias").death?.cause).toBe("bled to death after being hurt by Mara");
  });

  it("names a death from a condition no one caused by the condition alone", () => {
    const sim = setUp();
    replaceAgent(sim.state, { ...sim.agent("tobias"), health: 0.002 });
    startCondition(contextOf(sim), TOBIAS, "poisoned", { sourceAgentId: null });
    runTicks(sim, 2);
    expect(sim.agent("tobias").death?.cause).toBe("died of poison");
  });
});

describe("bleeding and bandages", () => {
  function stab(sim: TestSim, roll: number) {
    const knife = handOver(sim, "mara", "knife");
    fixRolls(sim, roll);
    aimWith(sim, "mara", knife, "attack", "Tobias");
    finish(sim, "mara");
  }

  it("starts bleeding from a cut that the chance lets through, caused by the attacker", () => {
    const sim = setUp();
    stab(sim, 0);
    expect(sim.agent("tobias").conditions).toEqual([
      expect.objectContaining({ name: "bleeding", sourceAgentId: "mara" }),
    ]);
  });

  it("leaves a cut without bleeding when the chance fails", () => {
    const sim = setUp();
    stab(sim, 0.5);
    expect(sim.agent("tobias").health).toBeLessThan(1);
    expect(conditionNames(sim, "tobias")).toEqual([]);
  });

  it("ends bleeding with a bandage", () => {
    const sim = setUp();
    start(sim, TOBIAS, "bleeding");
    const bandage = handOver(sim, "mara", "bandage");
    aimWith(sim, "mara", bandage, "use", "Tobias");
    finish(sim, "mara");
    expect(conditionNames(sim, "tobias")).toEqual([]);
  });
});
