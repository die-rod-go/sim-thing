import { describe, expect, it } from "vitest";
import { addComponent, writeField } from "../items/thing-writes";
import { readNumberField, readThingChanges, type ThingRef } from "../items/things";
import { contextOf, extendItems, readFieldOf, readHealth, setAgentHealth } from "./combat-test-kit";
import {
  ALWAYS,
  NEVER,
  NEXT_TO_OPEN_GROUND,
  OPEN_GROUND,
  TOBIAS,
  TWO_FROM_OPEN_GROUND,
  describeEvents,
  hasComponentNow,
  placeThing,
  runTicks,
  setUpRules,
} from "./rule-test-kit";
import { countEveryFirings, runEveryRules } from "./rule-timers";
import type { TestSim } from "./test-sim";

function setStock(sim: TestSim, field: ThingRef, amount: number): void {
  writeField(contextOf(sim), field, "stock.amount", amount);
}

const MARA_CAUSE = { killed: "", sourceId: "mara", depth: 0 };
const BURN_PER_MINUTE = 0.01;

describe("counting every-rule firings", () => {
  it("fires once per sim-minute for an every-1 rule, however long a tick is", () => {
    for (const minutesPerTick of [1, 2, 5, 10, 60]) {
      expect(countEveryFirings(7, minutesPerTick, 1)).toBe(minutesPerTick);
    }
  });

  it("fires an hourly rule once an hour, at any tick length", () => {
    for (const minutesPerTick of [1, 5, 7, 15, 60]) {
      const ticks = Math.ceil((24 * 60) / minutesPerTick) + 1;
      let total = 0;
      for (let tick = 1; tick <= ticks; tick += 1) {
        total += countEveryFirings(tick, minutesPerTick, 60);
      }
      expect(total).toBe(Math.floor((ticks * minutesPerTick) / 60));
    }
  });

  it("fires on the tick whose span holds the multiple", () => {
    expect(countEveryFirings(59, 1, 60)).toBe(0);
    expect(countEveryFirings(60, 1, 60)).toBe(1);
    expect(countEveryFirings(61, 1, 60)).toBe(0);
    expect(countEveryFirings(12, 5, 60)).toBe(1);
    expect(countEveryFirings(11, 5, 60)).toBe(0);
  });

  it("fires a rule shorter than a tick once per multiple inside it", () => {
    expect(countEveryFirings(3, 10, 3)).toBe(4);
    expect(countEveryFirings(1, 10, 4)).toBe(2);
  });

  it("counts nothing before the first tick has covered a minute", () => {
    expect(countEveryFirings(0, 5, 1)).toBe(0);
    expect(countEveryFirings(0, 5, 60)).toBe(0);
  });
});

describe("every rules", () => {
  it("runs a rule's steps once per sim-minute for as long as the thing matches", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: 20 });
    runTicks(sim, 25);
    expect(readHealth(sim, "tobias")).toBeCloseTo(1 - 20 * BURN_PER_MINUTE, 9);
    expect(hasComponentNow(sim, TOBIAS, "bleeding")).toBe(false);
  });

  it("fires once per minute the tick covers when a tick lasts longer", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "bleeding", { minutes: null });
    sim.state.tick += 1;
    runEveryRules(contextOf(sim), 5);
    expect(readHealth(sim, "tobias")).toBeCloseTo(1 - 5 * BURN_PER_MINUTE, 9);
  });

  it("adds a regrowing stock's hourly step on the tick that completes the hour", () => {
    const sim = setUpRules();
    const tree = placeThing(sim, "apple_tree", OPEN_GROUND);
    setStock(sim, tree, 2);
    runTicks(sim, 59);
    expect(readNumberField(sim.state, tree, "stock.amount")).toBe(2);
    runTicks(sim, 1);
    expect(readNumberField(sim.state, tree, "stock.amount")).toBe(2.2);
  });

  it("sees a component added during the phase first on the next tick", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const neighbour = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    addComponent(contextOf(sim), bench, "burning", { minutes: 30 });
    runTicks(sim, 1);
    expect(hasComponentNow(sim, neighbour, "burning")).toBe(true);
    expect(readFieldOf(sim, neighbour, "health.current")).toBe(3);
    runTicks(sim, 1);
    expect(readFieldOf(sim, neighbour, "health.current")).toBeCloseTo(3 - BURN_PER_MINUTE, 9);
  });

  it("stops firing on a thing whose component was taken off earlier in the same phase", () => {
    const sim = setUpRules();
    extendItems(sim, {
      rules: [
        {
          trigger: "every",
          minutes: 1,
          if: { has: "wet" },
          steps: [{ step: "remove", component: "wet" }],
        },
        {
          trigger: "every",
          minutes: 1,
          if: { has: "wet" },
          steps: [{ step: "damage", field: "health.current", amount: { min: 0.1, max: 0.1 } }],
        },
      ],
    });
    addComponent(contextOf(sim), TOBIAS, "wet", { minutes: null });
    runTicks(sim, 1);
    expect(readHealth(sim, "tobias")).toBe(1);
  });

  it("visits agents before entities, entities in id order, rules in file order", () => {
    const sim = setUpRules();
    extendItems(sim, {
      components: { ticking: {} },
      rules: [
        {
          trigger: "every",
          minutes: 1,
          if: { has: "ticking" },
          steps: [{ step: "announce", text: "ticked" }],
        },
      ],
    });
    const second = placeThing(sim, "bench", OPEN_GROUND);
    const first = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    for (const thing of [first, second, TOBIAS]) {
      addComponent(contextOf(sim), thing, "ticking", { minutes: null });
    }
    const [result] = runTicks(sim, 1);
    expect(result?.events.map((event) => event.actorId)).toEqual([
      "tobias",
      second.kind === "entity" ? second.entityId : "",
      first.kind === "entity" ? first.entityId : "",
    ]);
  });

  it("names a death from a fire after whoever started it, carried along as it spreads", () => {
    const sim = setUpRules(ALWAYS);
    setAgentHealth(sim, "tobias", 0.005);
    const bench = placeThing(sim, "bench", { x: 21, y: 15 });
    addComponent(contextOf(sim), bench, "burning", { minutes: 30 }, MARA_CAUSE);
    runTicks(sim, 3);
    expect(readThingChanges(sim.state, TOBIAS)?.burning?.sourceId).toBe("mara");
    expect(sim.agent("tobias").death?.cause).toBe("burned to death after being hurt by Mara");
  });

  it("names a death from a component that expired by the rule alone, with no one behind it", () => {
    const sim = setUpRules(NEVER);
    extendItems(sim, {
      rules: [
        {
          trigger: "becomes",
          if: { allOf: [{ not: { has: "wet" } }, { has: "flesh" }] },
          killed: "dried out",
          steps: [{ step: "damage", field: "health.current", amount: { min: 1, max: 1 } }],
        },
      ],
    });
    addComponent(contextOf(sim), TOBIAS, "wet", { minutes: 2 }, MARA_CAUSE);
    runTicks(sim, 5);
    expect(sim.agent("tobias").death?.cause).toBe("dried out");
    expect(sim.agent("tobias").death?.sourceId).toBeNull();
  });

  it("files a fire as caught and stopped, not every minute it burns", () => {
    const sim = setUpRules(NEVER);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const started = contextOf(sim);
    addComponent(started, bench, "burning", { minutes: 30 });
    const events = describeEvents([started.result, ...runTicks(sim, 40)]);
    expect(events).toEqual(["caught fire", "stopped burning"]);
  });

  it("leaves things alone when the spread's chance fails", () => {
    const sim = setUpRules(NEVER);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const near = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    addComponent(contextOf(sim), bench, "burning", { minutes: 30 });
    runTicks(sim, 1);
    expect(hasComponentNow(sim, near, "burning")).toBe(false);
  });

  it("reaches things within the radius and not beyond", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const near = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    const far = placeThing(sim, "bench", TWO_FROM_OPEN_GROUND);
    addComponent(contextOf(sim), bench, "burning", { minutes: 30 }, MARA_CAUSE);
    runTicks(sim, 1);
    expect(hasComponentNow(sim, near, "burning")).toBe(true);
    expect(hasComponentNow(sim, far, "burning")).toBe(false);
  });
});
