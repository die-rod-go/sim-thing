import { describe, expect, it } from "vitest";
import { findDefinition, resolveThingComponents } from "@village/shared";
import { loadTestItems } from "../sim/test-sim";
import { resolveDefinitionId, resolveNumber, resolveRange, resolveText } from "./verb-numbers";

const items = loadTestItems();
const knife = {
  item: resolveThingComponents(items, findDefinition(items, "knife").id, {}),
  self: null,
};
const bare = { item: null, self: null };

describe("numbers read from components", () => {
  it("takes a field as it is with from", () => {
    expect(resolveNumber({ from: "item.weapon.hitChance" }, knife)).toBe(0.7);
    expect(resolveRange({ from: "item.weapon.damage" }, knife)).toEqual({ min: 0.2, max: 0.4 });
    expect(resolveText({ from: "item.weapon.stimulus" }, knife)).toBe("cut");
  });

  it("multiplies a literal by a field with times", () => {
    expect(resolveNumber({ value: 2, times: "item.holdable.kilograms" }, knife)).toBeCloseTo(
      0.6,
      9,
    );
    const range = resolveRange({ min: 0.02, max: 0.05, times: "item.holdable.kilograms" }, knife);
    expect(range.min).toBeCloseTo(0.006, 9);
    expect(range.max).toBeCloseTo(0.015, 9);
  });

  it("reads self from the thing a rule fired on", () => {
    const sources = { item: null, self: knife.item };
    expect(resolveNumber({ from: "self.weapon.hitChance" }, sources)).toBe(0.7);
    expect(resolveDefinitionId("shards", sources)).toBe("shards");
    expect(resolveDefinitionId({ from: "self.breaks_into.item" }, sources)).toBe("broken_knife");
  });

  it("refuses a read in a verb used with no item", () => {
    expect(() => resolveNumber({ from: "item.weapon.hitChance" }, bare)).toThrow(/no item/);
  });
});
