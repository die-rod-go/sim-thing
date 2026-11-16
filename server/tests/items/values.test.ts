import { describe, expect, it } from "vitest";
import { matchesThing, stepSchema } from "@village/shared";
import { config } from "../../src/config";
import { entityThing, fixRolls, handOver } from "../sim/combat-test-kit";
import { TOBIAS, setUpRules } from "../sim/rule-test-kit";
import { destroyEntities } from "../../src/sim/steps/step-entities";
import { buildStepRun, buildVerbRun } from "../sim/steps/step-test-kit";
import { contextOf } from "../sim/combat-test-kit";
import type { TestSim } from "../../src/sim/test-sim";
import type { VerbChoice } from "../../src/sim/agent-runtime";
import {
  findMissingChoice,
  resolveDefinitionId,
  resolveFieldInput,
  resolveMatcherReads,
  resolveNumber,
  resolveText,
  type ValueScope,
} from "../../src/items/values";
import { viewThing } from "../../src/items/things";

function scopeFor(sim: TestSim, itemDefinitionId: string, choice: Partial<VerbChoice> = {}) {
  const item = handOver(sim, "mara", itemDefinitionId);
  const verbRun = buildVerbRun(sim, {
    items: [item],
    target: TOBIAS,
    targetName: "Tobias",
    choice,
  });
  const scope: ValueScope = { state: sim.state, verbRun, self: null };
  return { item, verbRun, scope };
}

describe("values", () => {
  it("passes a literal through", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    expect(resolveNumber(scope, 0.7)).toBe(0.7);
    expect(resolveText(scope, "cut")).toBe("cut");
    expect(resolveDefinitionId(scope, "bread")).toBe("bread");
  });

  it("reads a number field of the item", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    expect(resolveNumber(scope, { from: "item.food.hunger" })).toBe(0.5);
  });

  it("rolls a range field on the seeded generator", () => {
    const sim = setUpRules();
    fixRolls(sim, 0.5);
    const { scope } = scopeFor(sim, "knife");
    expect(resolveNumber(scope, { from: "item.weapon.damage" })).toBeCloseTo(0.3);
  });

  it("rolls within min and max", () => {
    const sim = setUpRules();
    fixRolls(sim, 0.25);
    const { scope } = scopeFor(sim, "bread");
    expect(resolveNumber(scope, { min: 0.1, max: 0.5 })).toBeCloseTo(0.2);
  });

  it("multiplies by a literal times and by a number field times", () => {
    const sim = setUpRules();
    fixRolls(sim, 0.5);
    const { scope } = scopeFor(sim, "knife");
    expect(resolveNumber(scope, { min: 0.2, max: 0.4, times: 0.5 })).toBeCloseTo(0.15);
    expect(
      resolveNumber(scope, { from: "item.weapon.hitChance", times: "item.holdable.kilograms" }),
    ).toBeCloseTo(0.21);
  });

  it("reads names, the decision's choice, and a field written as text", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "knife", { amount: 3, text: "meet at noon" });
    expect(resolveText(scope, { from: "user.name" })).toBe(sim.agent("mara").name);
    expect(resolveText(scope, { from: "item.name" })).toBe("knife");
    expect(resolveText(scope, { from: "target.name" })).toBe("Tobias");
    expect(resolveText(scope, { from: "choice.text" })).toBe("meet at noon");
    expect(resolveNumber(scope, { from: "choice.amount" })).toBe(3);
    expect(resolveText(scope, { from: "item.weapon.stimulus" })).toBe("cut");
    expect(resolveFieldInput(scope, { from: "choice.text" })).toBe("meet at noon");
    expect(resolveFieldInput(scope, true)).toBe(true);
  });

  it("reads a destroyed item from its snapshot", () => {
    const sim = setUpRules();
    const { item, scope } = scopeFor(sim, "bread");
    const run = buildStepRun(contextOf(sim), scope.verbRun);
    destroyEntities(run, [item]);
    expect(resolveNumber(scope, { from: "item.food.hunger" })).toBe(0.5);
    expect(resolveText(scope, { from: "item.name" })).toBe("bread");
  });

  it("throws, naming the path, when a guaranteed field is missing", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    expect(() => resolveNumber(scope, { from: "item.weapon.damage" })).toThrow(
      /item\.weapon\.damage/,
    );
  });

  it("finds a choice the decision did not give", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    const needsText = stepSchema.parse({
      step: "create",
      item: "note",
      count: 1,
      into: "user",
      fields: { "writing.text": { from: "choice.text" } },
    });
    const needsMinutes = stepSchema.parse({ step: "wait", minutes: { from: "choice.minutes" } });
    const sleepsUntilWoken = stepSchema.parse({
      step: "sleep",
      minutes: { from: "choice.minutes" },
    });
    expect(findMissingChoice(scope, needsText)).toBe("I didn't say what");
    expect(findMissingChoice(scope, needsMinutes)).toBe("I didn't say how long");
    expect(findMissingChoice(scope, sleepsUntilWoken)).toBeNull();
    const blank = scopeFor(sim, "bread", { text: "   " }).scope;
    expect(findMissingChoice(blank, needsText)).toBe("I didn't say what");
    const given = scopeFor(sim, "bread", { text: "hello" }).scope;
    expect(findMissingChoice(given, needsText)).toBeNull();
  });
});

describe("matchers that read a value", () => {
  const asFillingAsItem = { field: "food.hunger", atLeast: { from: "item.food.hunger" } };

  it("resolves a comparison's read from the run, from a snapshot once the thing is gone", () => {
    const sim = setUpRules();
    const { item, verbRun, scope } = scopeFor(sim, "bread");
    destroyEntities(buildStepRun(contextOf(sim), verbRun), [item]);
    const resolved = resolveMatcherReads(scope, asFillingAsItem);
    expect(resolved).toEqual({
      matcher: { field: "food.hunger", atLeast: 0.5 },
      isFullyResolved: true,
    });
    const bread = viewThing(sim.state, entityThing(handOver(sim, "mara", "bread")));
    if (bread === null) throw new Error("no bread");
    expect(matchesThing(resolved.matcher, bread)).toBe(true);
  });

  it("never matches a comparison whose read has nothing to read", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    const resolved = resolveMatcherReads(scope, {
      allOf: [{ has: "food" }, { field: "food.hunger", atMost: { from: "spare.food.hunger" } }],
    });
    expect(resolved.isFullyResolved).toBe(false);
    const bread = viewThing(sim.state, entityThing(handOver(sim, "mara", "bread")));
    if (bread === null) throw new Error("no bread");
    expect(matchesThing(resolved.matcher, bread)).toBe(false);
    expect(matchesThing(asFillingAsItem, bread)).toBe(false);
  });
});

describe("fresh ids", () => {
  it("gives a new text each time it is read, from the world's counter", () => {
    const sim = setUpRules();
    const { scope } = scopeFor(sim, "bread");
    sim.state.nextFreshId = 7;
    const first = resolveFieldInput(scope, { newId: true });
    const second = resolveFieldInput(scope, { newId: true });
    expect(first).toBe(config.steps.newIdFormat.split("{number}").join("7"));
    expect(second).not.toBe(first);
    expect(sim.state.nextFreshId).toBe(9);
  });
});
