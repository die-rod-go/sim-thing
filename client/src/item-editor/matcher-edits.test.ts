import { describe, expect, it } from "vitest";
import { matcherSchema, type FieldMatcher } from "@village/shared";
import { buildTestItemFile } from "../../../shared/src/items/test-item-file";
import {
  buildMatcherOfKind,
  changeMatcherKind,
  describeMatcher,
  findFieldComparison,
  findMatcherKind,
  listFieldComparisons,
  MATCHER_KINDS,
  setFieldComparison,
  setFieldComparisonValue,
  setMatcherField,
} from "./matcher-edits";

const file = buildTestItemFile();

describe("matcher edits", () => {
  it("builds a schema-valid matcher of every kind", () => {
    for (const kind of MATCHER_KINDS) {
      const matcher = buildMatcherOfKind(kind, file);
      expect(matcherSchema.safeParse(matcher).success).toBe(true);
      expect(findMatcherKind(matcher)).toBe(kind);
    }
  });

  it("starts a field matcher on the first field with a comparison that fits it", () => {
    expect(buildMatcherOfKind("field", file)).toEqual({ field: "health.max", atLeast: 0 });
  });

  it("keeps the parts when switching all of to any of", () => {
    expect(changeMatcherKind({ allOf: [{ where: "held" }] }, "anyOf", file)).toEqual({
      anyOf: [{ where: "held" }],
    });
  });

  it("wraps a term as the first part when it becomes a group", () => {
    expect(changeMatcherKind({ has: "food" }, "allOf", file)).toEqual({
      allOf: [{ has: "food" }],
    });
  });

  it("wraps a matcher in not and unwraps it when switching back to the inner kind", () => {
    const wrapped = changeMatcherKind({ has: "food" }, "not", file);
    expect(wrapped).toEqual({ not: { has: "food" } });
    expect(changeMatcherKind(wrapped, "has", file)).toEqual({ has: "food" });
    expect(changeMatcherKind(wrapped, "where", file)).toEqual({ where: "held" });
  });

  it("resets the comparison when the field changes to another type", () => {
    const matcher: FieldMatcher = { field: "health.current", above: 2 };
    expect(setMatcherField(matcher, "health.max", file)).toEqual({ field: "health.max", above: 2 });
    expect(setMatcherField(matcher, "weapon.stimulus", file)).toEqual({
      field: "weapon.stimulus",
      equals: "",
    });
  });

  it("edits the comparison and its value", () => {
    const matcher: FieldMatcher = { field: "health.current", above: 0 };
    const atMost = setFieldComparison(matcher, "atMost");
    expect(findFieldComparison(atMost)).toEqual({ comparison: "atMost", value: 0 });
    expect(setFieldComparisonValue(atMost, 0.5)).toEqual({ field: "health.current", atMost: 0.5 });
    expect(listFieldComparisons("number")).toHaveLength(5);
    expect(listFieldComparisons("text")).toEqual(["equals"]);
  });

  it("describes matchers in one line", () => {
    expect(describeMatcher({ allOf: [{ has: "door" }, { has: "closed" }] })).toBe(
      "has door and has closed",
    );
    expect(
      describeMatcher({
        anyOf: [{ has: "solid" }, { allOf: [{ has: "door" }, { has: "closed" }] }],
      }),
    ).toBe("any of (has solid, has door and has closed)");
    expect(describeMatcher({ not: { where: "self" } })).toBe("not where self");
    expect(describeMatcher({ field: "health.current", above: 0 })).toBe("health.current above 0");
  });
});
