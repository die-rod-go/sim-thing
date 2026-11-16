import { describe, expect, it } from "vitest";
import { findDropIndex, isBelowMiddleOf } from "../../src/item-editor/step-drag";

describe("step drop position", () => {
  it("moves a step down to just above the row it is dropped on", () => {
    expect(findDropIndex(0, { overIndex: 2, isBelowMiddle: false })).toBe(1);
  });

  it("moves a step down to just below the row it is dropped on", () => {
    expect(findDropIndex(0, { overIndex: 2, isBelowMiddle: true })).toBe(2);
  });

  it("moves a step up to just above or below the row it is dropped on", () => {
    expect(findDropIndex(3, { overIndex: 1, isBelowMiddle: false })).toBe(1);
    expect(findDropIndex(3, { overIndex: 1, isBelowMiddle: true })).toBe(2);
  });

  it("leaves a step where it is when dropped on itself", () => {
    expect(findDropIndex(2, { overIndex: 2, isBelowMiddle: true })).toBe(2);
    expect(findDropIndex(2, { overIndex: 2, isBelowMiddle: false })).toBe(2);
  });

  it("tells the lower half of a row from the upper", () => {
    expect(isBelowMiddleOf(100, 40, 130)).toBe(true);
    expect(isBelowMiddleOf(100, 40, 110)).toBe(false);
  });
});
