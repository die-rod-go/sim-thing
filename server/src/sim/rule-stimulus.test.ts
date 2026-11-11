import { describe, expect, it } from "vitest";
import { config } from "../config";
import { findEntityIfPresent } from "../items/entity-store";
import { addComponent } from "../items/thing-writes";
import { readThingChanges, type ThingRef } from "../items/things";
import { contextOf, extendItems, setAgentHealth } from "./combat-test-kit";
import {
  ALWAYS,
  NEXT_TO_OPEN_GROUND,
  OPEN_GROUND,
  TOBIAS,
  TWO_FROM_OPEN_GROUND,
  hasComponentNow,
  placeThing,
  setUpRules,
} from "./rule-test-kit";
import { stimulate } from "./steps/step-test-kit";
import type { TestSim } from "./test-sim";

function definitionOf(sim: TestSim, thing: ThingRef): string | undefined {
  if (thing.kind !== "entity") return undefined;
  return findEntityIfPresent(sim.state, thing.entityId)?.definitionId;
}

function ignite(sim: TestSim, thing: ThingRef): void {
  addComponent(contextOf(sim), thing, "burning", { minutes: 30 });
}

describe("stimulus rules", () => {
  it("sets a flammable thing alight when fire reaches it", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    stimulate(sim, bench, "fire");
    expect(hasComponentNow(sim, bench, "burning")).toBe(true);
  });

  it("ignores a stimulus nothing reacts to", () => {
    const sim = setUpRules(ALWAYS);
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const context = stimulate(sim, jar, "fire");
    expect(hasComponentNow(sim, jar, "burning")).toBe(false);
    expect(context.result.events).toEqual([]);
  });

  it("dries a wet thing instead of lighting it, judging every rule as the fire arrived", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    addComponent(contextOf(sim), bench, "wet", { minutes: null });
    stimulate(sim, bench, "fire");
    expect(hasComponentNow(sim, bench, "wet")).toBe(false);
    expect(hasComponentNow(sim, bench, "burning")).toBe(false);
  });

  it("puts out a burning thing with water", () => {
    const sim = setUpRules(ALWAYS);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    stimulate(sim, bench, "fire");
    stimulate(sim, bench, "water");
    expect(hasComponentNow(sim, bench, "burning")).toBe(false);
  });

  it("shatters a fragile thing hit by something, with a crash others can hear", () => {
    const sim = setUpRules(ALWAYS);
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const context = stimulate(sim, jar, "impact");
    expect(definitionOf(sim, jar)).toBe("shards");
    expect(
      context.result.events.map((event) => [event.kind, event.description, event.loudness]),
    ).toEqual([
      ["sound", config.steps.soundDescription, 10],
      ["announced", "broke", null],
    ]);
    expect(context.result.events[1]?.actorName).toBe("the jar");
  });

  it("judges every rule for a stimulus against the same moment, in file order", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "stimulus",
          stimulus: "poke",
          if: { allOf: [{ has: "flesh" }, { not: { has: "poisoned" } }] },
          steps: [{ step: "add", component: "poisoned" }],
        },
        {
          trigger: "stimulus",
          stimulus: "poke",
          if: { has: "poisoned" },
          steps: [{ step: "add", component: "wet" }],
        },
      ],
    });
    stimulate(sim, TOBIAS, "poke");
    expect(hasComponentNow(sim, TOBIAS, "poisoned")).toBe(true);
    expect(hasComponentNow(sim, TOBIAS, "wet")).toBe(false);
  });

  it("runs a rule even when an earlier one for the same stimulus took away what it needed", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "stimulus",
          stimulus: "poke",
          if: { has: "poisoned" },
          steps: [{ step: "remove", component: "poisoned" }],
        },
        {
          trigger: "stimulus",
          stimulus: "poke",
          if: { has: "poisoned" },
          steps: [{ step: "add", component: "wet" }],
        },
      ],
    });
    addComponent(contextOf(sim), TOBIAS, "poisoned", { minutes: null });
    stimulate(sim, TOBIAS, "poke");
    expect(hasComponentNow(sim, TOBIAS, "poisoned")).toBe(false);
    expect(hasComponentNow(sim, TOBIAS, "wet")).toBe(true);
  });

  it("skips a collected rule once an earlier one destroyed the thing", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "stimulus",
          stimulus: "smash",
          if: { has: "flammable" },
          steps: [{ step: "destroy" }],
        },
        {
          trigger: "stimulus",
          stimulus: "smash",
          if: { has: "flammable" },
          steps: [{ step: "add", component: "burning" }],
        },
      ],
    });
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = stimulate(sim, bench, "smash");
    expect(definitionOf(sim, bench)).toBeUndefined();
    expect(context.result.events).toEqual([]);
  });

  it("skips a collected rule once an earlier one transformed the thing", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "stimulus",
          stimulus: "smash",
          if: { has: "flammable" },
          steps: [{ step: "transform", into: "shards" }],
        },
        {
          trigger: "stimulus",
          stimulus: "smash",
          if: { has: "flammable" },
          steps: [{ step: "add", component: "wet" }],
        },
      ],
    });
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    stimulate(sim, bench, "smash");
    expect(definitionOf(sim, bench)).toBe("shards");
    expect(readThingChanges(sim.state, bench)).toEqual({});
  });

  it("spreads fire from a burning fragile thing that is hit, before it shatters", () => {
    const sim = setUpRules(ALWAYS);
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const bench = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    const farBench = placeThing(sim, "bench", TWO_FROM_OPEN_GROUND);
    ignite(sim, jar);
    stimulate(sim, jar, "impact");
    expect(definitionOf(sim, jar)).toBe("shards");
    expect(hasComponentNow(sim, bench, "burning")).toBe(true);
    expect(hasComponentNow(sim, farBench, "burning")).toBe(false);
  });

  it("carries the agent who sent a stimulus to every component the chain adds", () => {
    const sim = setUpRules(ALWAYS);
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const bench = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    ignite(sim, jar);
    stimulate(sim, jar, "impact");
    expect(readThingChanges(sim.state, bench)?.burning?.sourceAgentId).toBe("mara");
  });

  it("drops a chain of stimuli at the depth cap and reports it", () => {
    const sim = setUpRules(ALWAYS);
    extendItems(sim, {
      rules: [
        {
          trigger: "stimulus",
          stimulus: "echo",
          if: { has: "flesh" },
          steps: [{ step: "send", stimulus: "echo" }],
        },
      ],
    });
    const context = stimulate(sim, TOBIAS, "echo");
    expect(context.result.ruleDepthCapHits).toHaveLength(1);
    expect(context.result.ruleDepthCapHits[0]).toContain(`depth cap of ${config.rules.maxDepth}`);
  });

  it("burns bodies too, since the dead keep the person components", () => {
    const sim = setUpRules(ALWAYS);
    setAgentHealth(sim, "tobias", 0);
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "tobias"
        ? { ...agent, death: { tick: 0, cause: "x", sourceAgentId: null } }
        : agent,
    );
    const context = stimulate(sim, TOBIAS, "fire");
    expect(hasComponentNow(sim, TOBIAS, "burning")).toBe(true);
    expect(context.result.events[0]?.actorName).toBe("Tobias's body");
  });
});
