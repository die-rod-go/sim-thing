import { describe, expect, it } from "vitest";
import {
  findNumberValueMode,
  findNumberValueTimes,
  findSimpleValueMode,
  setNumberValueTimes,
  switchNumberValueMode,
  switchSimpleValueMode,
} from "./value-modes";

describe("value modes", () => {
  it("keeps a literal and a factor when a number switches between literal, read and roll", () => {
    const read = switchNumberValueMode(
      { min: 3, max: 4, times: "item.holdable.kilograms" },
      "from",
      "item.weapon.damage",
    );
    expect(read).toEqual({ from: "item.weapon.damage", times: "item.holdable.kilograms" });
    expect(switchNumberValueMode(3, "roll", "")).toEqual({ min: 3, max: 3 });
    expect(switchNumberValueMode({ min: 3, max: 4 }, "literal", "")).toBe(3);
  });

  it("finds the mode of a number, a roll and a read", () => {
    expect(findNumberValueMode(2)).toBe("literal");
    expect(findNumberValueMode({ min: 1, max: 2 })).toBe("roll");
    expect(findNumberValueMode({ from: "user.health.current" })).toBe("from");
  });

  it("sets and clears a factor on a roll or read but never on a literal", () => {
    expect(setNumberValueTimes({ min: 1, max: 2 }, 3)).toEqual({ min: 1, max: 2, times: 3 });
    const withField = setNumberValueTimes({ from: "item.a.b", times: 2 }, "user.a.c");
    expect(findNumberValueTimes(withField)).toBe("user.a.c");
    expect(setNumberValueTimes(withField, undefined)).toEqual({ from: "item.a.b" });
    expect(setNumberValueTimes(5, 2)).toBe(5);
  });

  it("switches text between a literal and a read", () => {
    expect(findSimpleValueMode("fire")).toBe("literal");
    expect(findSimpleValueMode({ from: "item.weapon.stimulus" })).toBe("from");
    expect(switchSimpleValueMode("from", "item.weapon.stimulus", "text")).toEqual({
      from: "item.weapon.stimulus",
    });
    expect(switchSimpleValueMode("literal", "x", "text")).toBe("text");
  });
});
