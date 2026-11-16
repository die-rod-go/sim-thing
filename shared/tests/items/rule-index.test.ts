import { describe, expect, it } from "vitest";
import type { Rule } from "../../src/items/item-file";
import { buildRuleIndex } from "../../src/items/rule-index";

const rules: Rule[] = [
  { trigger: "every", minutes: 5, if: { has: "regrows" }, steps: [] },
  { trigger: "stimulus", stimulus: "fire", if: { has: "flammable" }, steps: [] },
  { trigger: "becomes", if: { has: "burning" }, steps: [] },
  { trigger: "stimulus", stimulus: "fire", if: { has: "wet" }, steps: [] },
  {
    trigger: "becomes",
    if: { allOf: [{ field: "health.current", atMost: 0 }, { has: "burning" }] },
    steps: [],
  },
  { trigger: "every", minutes: 1, if: { has: "burning" }, steps: [] },
];

describe("the rule index", () => {
  const index = buildRuleIndex(rules);

  it("lists every-rules in file order with their place in the file", () => {
    expect(index.every.map((entry) => entry.index)).toEqual([0, 5]);
  });

  it("groups stimulus rules by stimulus in file order", () => {
    expect(index.stimulusByName.get("fire")?.map((entry) => entry.index)).toEqual([1, 3]);
    expect(index.stimulusByName.has("water")).toBe(false);
  });

  it("files a becomes rule under every component its matcher mentions", () => {
    expect(index.becomesByComponent.get("burning")?.map((entry) => entry.index)).toEqual([2, 4]);
    expect(index.becomesByComponent.get("health")?.map((entry) => entry.index)).toEqual([4]);
  });
});
