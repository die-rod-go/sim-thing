import { describe, expect, it } from "vitest";
import { computeMotionPosition, retargetMotion } from "../../src/village/agent-motion";

describe("agentMotion", () => {
  it("places a newly seen agent at its target without gliding", () => {
    const motion = retargetMotion(undefined, { x: 40, y: 8 }, 100, 500);
    expect(computeMotionPosition(motion, 100)).toEqual({ x: 40, y: 8 });
  });

  it("glides linearly and stops at the target", () => {
    const start = retargetMotion(undefined, { x: 0, y: 0 }, 0, 500);
    const motion = retargetMotion(start, { x: 16, y: 0 }, 0, 400);
    expect(computeMotionPosition(motion, 200)).toEqual({ x: 8, y: 0 });
    expect(computeMotionPosition(motion, 900)).toEqual({ x: 16, y: 0 });
  });

  it("starts a new glide from the current spot when retargeted mid-glide", () => {
    const start = retargetMotion(undefined, { x: 0, y: 0 }, 0, 400);
    const firstGlide = retargetMotion(start, { x: 16, y: 0 }, 0, 400);
    const secondGlide = retargetMotion(firstGlide, { x: 16, y: 16 }, 200, 400);
    expect(secondGlide.from).toEqual({ x: 8, y: 0 });
  });

  it("keeps the running glide when the target has not changed", () => {
    const start = retargetMotion(undefined, { x: 0, y: 0 }, 0, 400);
    const glide = retargetMotion(start, { x: 16, y: 0 }, 0, 400);
    expect(retargetMotion(glide, { x: 16, y: 0 }, 100, 400)).toBe(glide);
  });
});
