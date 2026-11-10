import { describe, expect, it } from "vitest";
import {
  addItem,
  addItems,
  countItem,
  findMissingItems,
  removeItem,
  removeItems,
} from "./inventory";

describe("inventory", () => {
  it("adds and counts items", () => {
    expect(countItem(addItem({ bread: 1 }, "bread", 2), "bread")).toBe(3);
    expect(countItem({}, "wood")).toBe(0);
  });

  it("drops entries that reach zero", () => {
    expect(removeItem({ bread: 1, wood: 2 }, "bread", 1)).toEqual({ wood: 2 });
  });

  it("refuses to go negative", () => {
    expect(() => removeItem({ bread: 1 }, "bread", 2)).toThrow();
  });

  it("adds and removes several items at once", () => {
    const inventory = addItems({ wheat: 1 }, { wheat: 2, wood: 1 });
    expect(removeItems(inventory, { wheat: 3 })).toEqual({ wood: 1 });
  });

  it("finds what is missing for a recipe", () => {
    expect(findMissingItems({ wheat: 1 }, { wheat: 2, wood: 1 })).toEqual({ wheat: 1, wood: 1 });
  });
});
