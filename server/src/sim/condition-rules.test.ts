import { describe, expect, it } from "vitest";
import { addComponent, removeComponent, replaceDefinition } from "../items/thing-writes";
import { readThingChanges } from "../items/things";
import { computeConditionEndTick } from "../status/conditions";
import {
  aimWith,
  contextOf,
  finish,
  fixRolls,
  handOver,
  readHealth,
  setAgentHealth,
} from "./combat-test-kit";
import {
  ALWAYS,
  NEVER,
  OPEN_GROUND,
  TOBIAS,
  describeEvents,
  hasComponentNow,
  placeThing,
  runTicks,
  setUpRules,
} from "./rule-test-kit";
import type { RuleCause } from "./rule-cause";
import type { TestSim } from "./test-sim";

const MARA_CAUSE: RuleCause = { killed: "", sourceAgentId: "mara", depth: 0 };

function endTickOf(sim: TestSim, name: string): number | null | undefined {
  return sim.agent("tobias").bodyChanges[name]?.endsAtTick;
}

describe("conditions made of components and rules", () => {
  it("counts a component's length in minutes, whatever a tick lasts", () => {
    expect(computeConditionEndTick(20, 100, 1)).toBe(121);
    expect(computeConditionEndTick(20, 100, 5)).toBe(105);
    expect(computeConditionEndTick(null, 100, 5)).toBeNull();
  });

  it("extends a component added again to the later end, and says nothing the second time", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: 20 }, MARA_CAUSE);
    const firstEnd = endTickOf(sim, "bleeding");
    runTicks(sim, 10);
    const again = contextOf(sim);
    addComponent(again, TOBIAS, "bleeding", { minutes: 20 }, MARA_CAUSE);
    expect(endTickOf(sim, "bleeding")).toBe((firstEnd ?? 0) + 10);
    expect(again.result.events).toEqual([]);
  });

  it("lasts until something removes it when it has no length", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "poisoned", { minutes: null });
    runTicks(sim, 200);
    expect(hasComponentNow(sim, TOBIAS, "poisoned")).toBe(true);
    removeComponent(contextOf(sim), TOBIAS, "poisoned");
    expect(hasComponentNow(sim, TOBIAS, "poisoned")).toBe(false);
  });

  it("is seen starting and stopping, once each, as announcements of the one carrying it", () => {
    const sim = setUpRules();
    const started = contextOf(sim);
    addComponent(started, TOBIAS, "bleeding", { minutes: 20 });
    expect(started.result.events.map((event) => [event.kind, event.description])).toEqual([
      ["announced", "started bleeding"],
    ]);
    const results = runTicks(sim, 25);
    expect(describeEvents(results)).toEqual(["stopped bleeding"]);
  });

  it("makes getting wet and drying off events too", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const wetted = contextOf(sim);
    addComponent(wetted, bench, "wet", { minutes: 5 });
    expect(describeEvents([wetted.result, ...runTicks(sim, 8)])).toEqual(["got wet", "dried off"]);
  });

  it("keeps poison to the poisoned agent, who remembers it and gets an urgent decision", () => {
    const sim = setUpRules();
    const started = contextOf(sim);
    addComponent(started, TOBIAS, "poisoned", { minutes: null });
    expect(started.result.events).toEqual([]);
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I was poisoned/);
    removeComponent(contextOf(sim), TOBIAS, "poisoned");
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I got over the poison/);
  });

  it("names a death from bleeding after whoever caused it", () => {
    const sim = setUpRules();
    setAgentHealth(sim, "tobias", 0.05);
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: 20 }, MARA_CAUSE);
    runTicks(sim, 10);
    expect(sim.agent("tobias").death?.cause).toBe("bled to death after being hurt by Mara");
  });

  it("names a death from poison no one caused by the rule's phrase alone", () => {
    const sim = setUpRules();
    setAgentHealth(sim, "tobias", 0.002);
    addComponent(contextOf(sim), TOBIAS, "poisoned", { minutes: null });
    runTicks(sim, 2);
    expect(sim.agent("tobias").death?.cause).toBe("died of poison");
  });

  it("drops everything a thing was given when it is transformed, announcing nothing", () => {
    const sim = setUpRules(ALWAYS);
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    addComponent(contextOf(sim), jar, "wet", { minutes: 5 });
    if (jar.kind !== "entity") throw new Error("not an entity");
    const context = contextOf(sim);
    replaceDefinition(context, jar.entityId, "shards");
    expect(context.result.events).toEqual([]);
    expect(readThingChanges(sim.state, jar)).toEqual({});
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
    const sim = setUpRules();
    stab(sim, 0);
    expect(hasComponentNow(sim, TOBIAS, "bleeding")).toBe(true);
    expect(sim.agent("tobias").bodyChanges.bleeding?.sourceAgentId).toBe("mara");
  });

  it("leaves a cut without bleeding when the chance fails", () => {
    const sim = setUpRules(NEVER);
    stab(sim, 0.5);
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
    expect(hasComponentNow(sim, TOBIAS, "bleeding")).toBe(false);
  });

  it("ends bleeding with a bandage", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: 20 });
    const bandage = handOver(sim, "mara", "bandage");
    aimWith(sim, "mara", bandage, "use", "Tobias");
    finish(sim, "mara");
    expect(hasComponentNow(sim, TOBIAS, "bleeding")).toBe(false);
  });
});
