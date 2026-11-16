import { describe, expect, it } from "vitest";
import { STEP_TYPES, VERB_ONLY_STEPS, stepSchema, type Rule, type Verb } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import {
  STEP_DESCRIPTIONS,
  STEP_GROUPS,
  buildNewStep,
  listAllowedStepTypes,
} from "../../src/item-editor/step-catalog";

const file = buildTestItemFile();
const verb: Verb = {
  name: "poke",
  appliesTo: { has: "sharp" },
  target: { has: "flesh" },
  reach: 1,
  takes: [],
  isDoneInPassing: false,
  steps: [],
  phrases: {},
};
const rule: Rule = { trigger: "every", minutes: 1, if: { has: "food" }, steps: [] } as Rule;

describe("the step catalog", () => {
  it("describes every step type once and groups it once", () => {
    expect(Object.keys(STEP_DESCRIPTIONS).sort()).toEqual([...STEP_TYPES].sort());
    expect(STEP_GROUPS.flatMap((group) => group.types).sort()).toEqual([...STEP_TYPES].sort());
  });

  it("leaves the verb-only steps out of a rule", () => {
    const allowed = listAllowedStepTypes("rule");
    expect(allowed.some((type) => VERB_ONLY_STEPS.has(type))).toBe(false);
    expect(listAllowedStepTypes("verb")).toHaveLength(STEP_TYPES.length);
  });

  it("builds a valid starting step of every type in a verb", () => {
    for (const type of STEP_TYPES) {
      const step = buildNewStep(type, { file, owner: { kind: "verb", verb }, stepIndex: 0 });
      expect(stepSchema.safeParse(step).success, type).toBe(true);
    }
  });

  it("builds a valid starting step of every allowed type in a rule", () => {
    for (const type of listAllowedStepTypes("rule")) {
      const step = buildNewStep(type, { file, owner: { kind: "rule", rule }, stepIndex: 0 });
      expect(stepSchema.safeParse(step).success, type).toBe(true);
      expect("on" in step).toBe(false);
    }
  });

  it("starts on the item, then the target, then the user", () => {
    const spot = (changed: Partial<Verb>) => ({
      file,
      owner: { kind: "verb" as const, verb: { ...verb, ...changed } },
      stepIndex: 0,
    });
    expect(buildNewStep("destroy", spot({}))).toMatchObject({ on: "item" });
    expect(buildNewStep("destroy", spot({ appliesTo: undefined }))).toMatchObject({ on: "target" });
    expect(
      buildNewStep("destroy", spot({ appliesTo: undefined, target: undefined })),
    ).toMatchObject({ on: "user" });
  });
});
