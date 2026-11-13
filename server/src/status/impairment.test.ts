import { describe, expect, it } from "vitest";
import type { Needs } from "@village/shared";
import { findFailedRecall, findRecallFog, findSlowdown } from "./impairment";

const SATISFIED: Needs = { hunger: 0.9, energy: 0.9, social: 0.9, fun: 0.9 };

describe("impairment", () => {
  it("leaves a rested, fed, unhurt agent unimpaired", () => {
    expect(findSlowdown({ health: 1, needs: SATISFIED })).toBeNull();
    expect(findRecallFog({ health: 1, needs: SATISFIED })).toBeNull();
  });

  it("names exhaustion as what slows the agent down", () => {
    const slowdown = findSlowdown({ health: 1, needs: { ...SATISFIED, energy: 0.05 } });
    expect(slowdown?.statusWords).toBe("exhausted");
    expect(slowdown?.amount).toBeGreaterThan(0);
  });

  it("adds up slowdowns from several pressing needs and names them all", () => {
    const exhausted = findSlowdown({ health: 1, needs: { ...SATISFIED, energy: 0.05 } });
    const both = findSlowdown({ health: 1, needs: { ...SATISFIED, energy: 0.05, hunger: 0.05 } });
    expect(both?.statusWords).toBe("starving and exhausted");
    expect(both?.amount).toBeGreaterThan(exhausted?.amount ?? Infinity);
  });

  it("counts a serious wound as slowing the agent down", () => {
    expect(findSlowdown({ health: 0.2, needs: SATISFIED })?.statusWords).toBe("in a bad way");
  });

  it("fails recall only when the roll is under the fog chance", () => {
    const status = { health: 1, needs: { ...SATISFIED, energy: 0.05 } };
    const chance = findRecallFog(status)?.amount ?? 0;
    expect(findFailedRecall(status, chance - 0.01)?.statusWords).toBe("exhausted");
    expect(findFailedRecall(status, chance + 0.01)).toBeNull();
  });

  it("never fails recall for a clear-headed agent", () => {
    expect(findFailedRecall({ health: 1, needs: SATISFIED }, 0)).toBeNull();
  });
});
