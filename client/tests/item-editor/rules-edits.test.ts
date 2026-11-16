import { describe, expect, it } from "vitest";
import { ruleSchema } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import {
  addRule,
  describeRuleTrigger,
  changeRuleTrigger,
  removeRule,
  summarizeRule,
} from "../../src/item-editor/rules-edits";

describe("rules panel edits", () => {
  it("adds a stimulus rule for the first known stimulus and removes it again", () => {
    const file = addRule(buildTestItemFile(), ["fire"]);
    expect(file.rules[0]).toMatchObject({ trigger: "stimulus", stimulus: "fire" });
    expect(removeRule(file, 0).rules).toEqual([]);
  });

  it("describes each trigger", () => {
    const rules = [
      { trigger: "every", minutes: 60, if: { has: "food" }, steps: [] },
      { trigger: "stimulus", stimulus: "fire", if: { has: "food" }, steps: [] },
      { trigger: "becomes", if: { has: "food" }, steps: [] },
    ].map((rule) => ruleSchema.parse(rule));
    expect(rules.map(describeRuleTrigger)).toEqual([
      "every 60 minutes",
      "stimulus fire",
      "becomes",
    ]);
  });

  it("summarizes a rule without printing JSON", () => {
    const rule = ruleSchema.parse({ trigger: "becomes", if: { has: "food" }, steps: [] });
    expect(summarizeRule(rule)).toBe("if has food: 0 steps");
  });

  it("keeps the matcher, steps and death phrase when the trigger changes", () => {
    const rule = ruleSchema.parse({
      trigger: "becomes",
      if: { has: "food" },
      steps: [{ step: "destroy" }],
      killed: "burned to death",
    });
    const changed = changeRuleTrigger(rule, "stimulus", ["fire"]);
    expect(changed).toMatchObject({
      trigger: "stimulus",
      stimulus: "fire",
      if: { has: "food" },
      killed: "burned to death",
    });
    expect(changed.steps).toEqual(rule.steps);
  });

  it("gives an every rule a default interval and a stimulus rule a placeholder name", () => {
    const rule = ruleSchema.parse({ trigger: "becomes", if: { has: "food" }, steps: [] });
    expect(changeRuleTrigger(rule, "every", [])).toMatchObject({ trigger: "every", minutes: 60 });
    expect(changeRuleTrigger(rule, "stimulus", [])).toMatchObject({ stimulus: "new_stimulus" });
    expect(changeRuleTrigger(rule, "becomes", [])).not.toHaveProperty("killed");
  });
});
