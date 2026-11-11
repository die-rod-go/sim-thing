import { describe, expect, it } from "vitest";
import { ruleSchema } from "@village/shared";
import { buildTestItemFile } from "../../../shared/src/items/test-item-file";
import {
  addRule,
  describeRuleTrigger,
  formatRuleText,
  parseRuleText,
  removeRule,
} from "./rules-edits";

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

  it("round-trips a rule through its JSON text", () => {
    const rule = { trigger: "becomes", if: { has: "food" }, steps: [{ step: "destroy" }] };
    const parsed = parseRuleText(JSON.stringify(rule));
    expect(parsed.error).toBeNull();
    expect(parsed.rule && parseRuleText(formatRuleText(parsed.rule)).rule).toEqual(parsed.rule);
  });

  it("rejects text that is not JSON or not a rule, saying why", () => {
    expect(parseRuleText("{").rule).toBeNull();
    const wrong = parseRuleText(JSON.stringify({ trigger: "every", if: {}, steps: [] }));
    expect(wrong.rule).toBeNull();
    expect(wrong.error).toContain("minutes");
  });
});
