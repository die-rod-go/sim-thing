import { describe, expect, it } from "vitest";
import { findDefinition } from "@village/shared";
import { loadTestItems } from "../sim/test-sim";
import { resolveNumber, resolveRange, resolveText } from "./verb-numbers";

const knife = findDefinition(loadTestItems(), "knife");

describe("numbers read from components", () => {
  it("takes a field as it is with from", () => {
    expect(resolveNumber({ from: "item.weapon.hitChance" }, knife)).toBe(0.7);
    expect(resolveRange({ from: "item.weapon.damage" }, knife)).toEqual({ min: 0.2, max: 0.4 });
    expect(resolveText({ from: "item.weapon.stimulus" }, knife)).toBe("cut");
  });

  it("multiplies a literal by a field with times", () => {
    expect(resolveNumber({ value: 2, times: "item.weight.kilograms" }, knife)).toBeCloseTo(0.6, 9);
    const range = resolveRange({ min: 0.02, max: 0.05, times: "item.weight.kilograms" }, knife);
    expect(range.min).toBeCloseTo(0.006, 9);
    expect(range.max).toBeCloseTo(0.015, 9);
  });

  it("refuses a read in a verb used with no item", () => {
    expect(() => resolveNumber({ from: "item.weapon.hitChance" }, null)).toThrow(/no item/);
  });
});
