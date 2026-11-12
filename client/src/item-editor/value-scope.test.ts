import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "../../../shared/src/items/test-item-file";
import type { Verb } from "@village/shared";
import type { ValueSpot } from "./step-owner";
import {
  listGivenNames,
  listGuaranteedComponentsOf,
  listReadablePaths,
  listThingNames,
} from "./value-scope";

const file = buildTestItemFile();

function buildVerb(overrides: Record<string, unknown>): Verb {
  const verb = file.verbs[0];
  if (!verb) throw new Error("no verb");
  return { ...verb, ...overrides } as Verb;
}

function spotOf(verb: Verb, stepIndex: number | null = null): ValueSpot {
  return { file, owner: { kind: "verb", verb }, stepIndex };
}

describe("value scope", () => {
  it("offers the fields of the components appliesTo guarantees", () => {
    const verb = buildVerb({ appliesTo: { has: "weapon" }, takes: [], steps: [] });
    const paths = listReadablePaths(spotOf(verb), "number");
    expect(paths).toContain("item.weapon.damage");
    expect(paths).toContain("item.weapon.hitChance");
    expect(paths).toContain("user.health.current");
    expect(paths).not.toContain("item.weapon.stimulus");
    expect(listReadablePaths(spotOf(verb), "factor")).not.toContain("item.weapon.damage");
    expect(listReadablePaths(spotOf(verb), "text")).toContain("item.weapon.stimulus");
  });

  it("offers nothing for item in a bare-handed verb", () => {
    const verb = buildVerb({ appliesTo: undefined, steps: [] });
    expect(listThingNames(spotOf(verb))).toEqual(["user"]);
    expect(listReadablePaths(spotOf(verb), "number").some((path) => path.startsWith("item."))).toBe(
      false,
    );
  });

  it("offers an as name only after the step that gives it", () => {
    const verb = buildVerb({
      appliesTo: undefined,
      steps: [
        { step: "require", in: "user", rule: { has: "food" }, as: "snack" },
        { step: "destroy", on: "snack" },
      ],
    });
    expect(listThingNames(spotOf(verb, 0))).toEqual(["user"]);
    expect(listThingNames(spotOf(verb, 1))).toEqual(["user", "snack"]);
    expect(listThingNames(spotOf(verb, null))).toEqual(["user"]);
    expect(listGivenNames(spotOf(verb, 1)).get("snack")).toEqual({ has: "food" });
    expect(listGuaranteedComponentsOf(spotOf(verb, 1), "snack")).toEqual(["food"]);
    expect(listReadablePaths(spotOf(verb, 1), "number")).toContain("snack.food.hunger");
  });

  it("offers self in a rule and no choice", () => {
    const rule = {
      trigger: "every" as const,
      minutes: 1,
      if: { has: "health" },
      steps: [],
    };
    const spot: ValueSpot = { file, owner: { kind: "rule", rule }, stepIndex: 0 };
    expect(listThingNames(spot)).toEqual(["self"]);
    expect(listReadablePaths(spot, "number")).toEqual(["self.health.max", "self.health.current"]);
  });

  it("offers choice values by what the verb takes", () => {
    const plain = buildVerb({ takes: [], steps: [] });
    expect(listReadablePaths(spotOf(plain), "number")).toContain("choice.amount");
    expect(listReadablePaths(spotOf(plain), "number")).not.toContain("choice.minutes");
    expect(listReadablePaths(spotOf(plain), "text")).not.toContain("choice.text");
    const taking = buildVerb({ takes: ["minutes", "text"], steps: [] });
    expect(listReadablePaths(spotOf(taking), "factor")).toContain("choice.minutes");
    expect(listReadablePaths(spotOf(taking), "text")).toContain("choice.text");
    expect(listReadablePaths(spotOf(taking), "text")).toContain("user.name");
  });

  it("knows the body components for user", () => {
    expect(listGuaranteedComponentsOf(spotOf(buildVerb({ steps: [] })), "user")).toEqual([
      "flesh",
      "health",
    ]);
  });
});
