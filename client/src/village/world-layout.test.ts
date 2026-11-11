import { describe, expect, it } from "vitest";
import { clampIntoView } from "./world-layout";

describe("clampIntoView", () => {
  it("leaves a box that already fits where it is", () => {
    expect(clampIntoView(100, 50, 400, 8)).toBe(100);
  });

  it("pulls a box back from the far edge", () => {
    expect(clampIntoView(380, 50, 400, 8)).toBe(342);
  });

  it("keeps a box off the near edge", () => {
    expect(clampIntoView(-20, 50, 400, 8)).toBe(8);
  });
});
