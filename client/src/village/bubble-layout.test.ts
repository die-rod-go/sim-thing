import { describe, expect, it } from "vitest";
import { layOutBubbleStacks, type BubbleLayoutSpacing, type BubbleStackBox } from "./bubble-layout";

const SPACING: BubbleLayoutSpacing = { gap: 2, maxSideShiftFraction: 2.5, sameColumnTolerance: 1 };

function makeStack(agentId: string, anchorX: number, anchorBottom: number): BubbleStackBox {
  return { agentId, anchorX, anchorBottom, width: 40, height: 10 };
}

describe("layOutBubbleStacks", () => {
  it("keeps a lone stack right above its speaker", () => {
    const placements = layOutBubbleStacks([makeStack("ada", 100, 50)], SPACING);
    expect(placements.get("ada")).toEqual({ centerX: 100, bottom: 50 });
  });

  it("leaves stacks that are far apart where they are", () => {
    const placements = layOutBubbleStacks(
      [makeStack("ada", 100, 50), makeStack("bob", 200, 50)],
      SPACING,
    );
    expect(placements.get("ada")).toEqual({ centerX: 100, bottom: 50 });
    expect(placements.get("bob")).toEqual({ centerX: 200, bottom: 50 });
  });

  it("slides a neighbor's stack sideways, away from the other speaker, instead of lifting it", () => {
    const placements = layOutBubbleStacks(
      [makeStack("ada", 110, 40), makeStack("bob", 100, 50)],
      SPACING,
    );
    expect(placements.get("bob")).toEqual({ centerX: 100, bottom: 50 });
    expect(placements.get("ada")).toEqual({ centerX: 100 + 20 + 2 + 20, bottom: 40 });
  });

  it("slides left when the speaker stands left of the one it would cover", () => {
    const placements = layOutBubbleStacks(
      [makeStack("ada", 90, 40), makeStack("bob", 100, 50)],
      SPACING,
    );
    expect(placements.get("ada")).toEqual({ centerX: 100 - 20 - 2 - 20, bottom: 40 });
  });

  it("lifts a stack whose speaker shares a column with the one it would cover", () => {
    const placements = layOutBubbleStacks(
      [makeStack("ada", 100, 40), makeStack("bob", 100, 50)],
      SPACING,
    );
    expect(placements.get("ada")).toEqual({ centerX: 100, bottom: 50 - 10 - 2 });
  });

  it("lifts instead of sliding further than the side-shift limit", () => {
    const narrowSpacing = { ...SPACING, maxSideShiftFraction: 0.25 };
    const placements = layOutBubbleStacks(
      [makeStack("ada", 110, 40), makeStack("bob", 100, 50)],
      narrowSpacing,
    );
    expect(placements.get("ada")).toEqual({ centerX: 110, bottom: 50 - 10 - 2 });
  });

  it("stacks a crowd of speakers on one spot without any two overlapping", () => {
    const crowd = ["ada", "bob", "cy", "dee"].map((agentId) => makeStack(agentId, 100, 50));
    const bottoms = [...layOutBubbleStacks(crowd, SPACING).values()]
      .map((placement) => placement.bottom)
      .sort((first, second) => first - second);
    expect(bottoms).toEqual([14, 26, 38, 50]);
  });

  it("spreads a row of close speakers sideways without any two overlapping", () => {
    const row = ["ada", "bob", "cy"].map((agentId, index) =>
      makeStack(agentId, 100 + index * 5, 50),
    );
    const centers = [...layOutBubbleStacks(row, SPACING).values()]
      .map((placement) => placement.centerX)
      .sort((first, second) => first - second);
    expect(centers).toEqual([100, 142, 184]);
  });
});
