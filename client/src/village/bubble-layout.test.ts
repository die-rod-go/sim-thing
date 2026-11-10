import { describe, expect, it } from "vitest";
import { layOutBubbleStacks, type BubbleStackBox } from "./bubble-layout";

const GAP = 2;

function makeStack(agentId: string, anchorX: number, anchorBottom: number): BubbleStackBox {
  return { agentId, anchorX, anchorBottom, width: 40, height: 10 };
}

describe("layOutBubbleStacks", () => {
  it("keeps a lone stack right above its speaker", () => {
    const bottoms = layOutBubbleStacks([makeStack("ada", 100, 50)], GAP);
    expect(bottoms.get("ada")).toBe(50);
  });

  it("leaves stacks that are far apart where they are", () => {
    const bottoms = layOutBubbleStacks([makeStack("ada", 100, 50), makeStack("bob", 200, 50)], GAP);
    expect(bottoms.get("ada")).toBe(50);
    expect(bottoms.get("bob")).toBe(50);
  });

  it("lifts the higher speaker's stack above a neighbor's instead of overlapping", () => {
    const bottoms = layOutBubbleStacks([makeStack("ada", 100, 40), makeStack("bob", 110, 50)], GAP);
    expect(bottoms.get("bob")).toBe(50);
    expect(bottoms.get("ada")).toBe(50 - 10 - GAP);
  });

  it("stacks a crowd of speakers on one spot without any two overlapping", () => {
    const crowd = ["ada", "bob", "cy", "dee"].map((agentId) => makeStack(agentId, 100, 50));
    const bottoms = [...layOutBubbleStacks(crowd, GAP).values()].sort(
      (first, second) => first - second,
    );
    expect(bottoms).toEqual([14, 26, 38, 50]);
  });
});
