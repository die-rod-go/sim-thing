import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createEntity, findEntityIfPresent } from "../items/entity-store";
import {
  replaceDefinition,
  removeComponent,
  writeField,
  addComponent,
} from "../items/thing-writes";
import { contextOf, extendItems } from "./combat-test-kit";
import {
  ALWAYS,
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

const HEALTH = "health.current";
const MARA_KILLS: RuleCause = { killed: "stabbed by {actor}", sourceId: "mara", depth: 0 };

const WORN_RULE = {
  trigger: "becomes",
  if: { field: HEALTH, atMost: 1 },
  steps: [{ step: "announce", text: "wore thin" }],
};

function setUpWithWornRule(): TestSim {
  const sim = setUpRules(ALWAYS);
  extendItems(sim, {
    rules: [WORN_RULE],
    definitions: [
      {
        id: "thin_bench",
        name: "thin bench",
        glyph: { index: 210, color: "#b07a44" },
        components: { health: { max: 3, current: 1 }, burning: {} },
      },
    ],
  });
  return sim;
}

describe("becomes rules", () => {
  it("fires once when a write makes a thing match, not on a repeated write", () => {
    const sim = setUpWithWornRule();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = contextOf(sim);
    writeField(context, bench, HEALTH, 2);
    expect(context.result.events).toEqual([]);
    writeField(context, bench, HEALTH, 0.8);
    writeField(context, bench, HEALTH, 0.5);
    expect(describeEvents([context.result])).toEqual(["wore thin"]);
  });

  it("fires again after the thing stopped matching and matches anew", () => {
    const sim = setUpWithWornRule();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = contextOf(sim);
    writeField(context, bench, HEALTH, 0.8);
    writeField(context, bench, HEALTH, 3);
    writeField(context, bench, HEALTH, 0.5);
    expect(describeEvents([context.result])).toEqual(["wore thin", "wore thin"]);
  });

  it("does not fire when a thing is created already matching", () => {
    const sim = setUpWithWornRule();
    const context = contextOf(sim);
    const place = sim.agent("mara").place;
    createEntity(sim.state, "thin_bench", { kind: "tile", place, pos: OPEN_GROUND });
    expect(context.result.events).toEqual([]);
  });

  it("does not fire when a thing is transformed into something that matches", () => {
    const sim = setUpWithWornRule();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = contextOf(sim);
    if (bench.kind !== "entity") throw new Error("not an entity");
    replaceDefinition(context, bench.entityId, "thin_bench");
    expect(context.result.events).toEqual([]);
    writeField(context, bench, HEALTH, 0.5);
    expect(context.result.events).toEqual([]);
  });

  it("fires for a removal only on things that had the component", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = contextOf(sim);
    removeComponent(context, bench, "burning");
    removeComponent(context, bench, "flammable");
    expect(context.result.events).toEqual([]);
    addComponent(context, bench, "burning", { minutes: null });
    removeComponent(context, bench, "burning");
    expect(describeEvents([context.result])).toEqual(["caught fire", "stopped burning"]);
  });

  it("fires when a component runs out, with no one behind it", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    addComponent(contextOf(sim), bench, "wet", { minutes: 3 });
    const events = describeEvents(runTicks(sim, 6));
    expect(events).toEqual(["dried off"]);
    expect(hasComponentNow(sim, bench, "wet")).toBe(false);
  });

  it("settles a body's death first, then fires the rules its health reaching 0 makes true", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "becomes",
          if: { field: HEALTH, atMost: 0 },
          steps: [{ step: "announce", text: "went quiet" }],
        },
      ],
    });
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 0, MARA_KILLS);
    expect(context.result.events.map((event) => event.kind)).toEqual(["died", "announced"]);
    expect(sim.agent("tobias").death?.cause).toBe("stabbed by Mara");
    expect(hasComponentNow(sim, TOBIAS, "alive")).toBe(false);
  });

  it("keeps the alive tag in step with death, removing it only after the death is settled", () => {
    const sim = setUpRules(ALWAYS);
    const context = contextOf(sim);
    writeField(context, TOBIAS, HEALTH, 0.5);
    expect(hasComponentNow(sim, TOBIAS, "alive")).toBe(true);
    writeField(context, TOBIAS, HEALTH, 0, MARA_KILLS);
    expect(sim.agent("tobias").death).not.toBeNull();
    expect(hasComponentNow(sim, TOBIAS, "alive")).toBe(false);
  });

  it("skips a collected rule once an earlier one destroyed the thing", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      components: { hexed: {} },
      rules: [
        { trigger: "becomes", if: { has: "hexed" }, steps: [{ step: "destroy" }] },
        {
          trigger: "becomes",
          if: { has: "hexed" },
          steps: [{ step: "announce", text: "was hexed" }],
        },
      ],
    });
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = contextOf(sim);
    addComponent(context, bench, "hexed", { minutes: null });
    expect(bench.kind === "entity" && findEntityIfPresent(sim.state, bench.entityId)).toBeFalsy();
    expect(context.result.events).toEqual([]);
  });

  it("drops a chain of rules setting off rules at the depth cap and reports it", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "becomes",
          if: { has: "poisoned" },
          steps: [{ step: "remove", component: "poisoned" }],
        },
        {
          trigger: "becomes",
          if: { not: { has: "poisoned" } },
          steps: [{ step: "add", component: "poisoned" }],
        },
      ],
    });
    const context = contextOf(sim);
    addComponent(context, TOBIAS, "poisoned", { minutes: null });
    expect(context.result.ruleDepthCapHits.length).toBeGreaterThan(0);
    expect(context.result.ruleDepthCapHits[0]).toContain(`depth cap of ${config.rules.maxDepth}`);
  });
});
