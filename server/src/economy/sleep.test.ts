import { describe, expect, it } from "vitest";
import { config } from "../config";
import { advanceSleep, endSleep, findWakeReason, isAsleep, startSleep } from "./sleep";
import { makeAgent } from "./test-fixtures";

describe("sleep", () => {
  it("sleep recovers energy at the agent's own rate", () => {
    const agent = makeAgent({
      body: { sleepRecoveryPerHour: 0.12, strength: 0.5, agility: 0.5 },
      needs: { hunger: 0.8, energy: 0.2, social: 0.8, fun: 0.8 },
    });
    const rested = advanceSleep(agent, 60);
    expect(rested.needs.energy).toBeCloseTo(0.32, 9);
    expect(rested.needs.hunger).toBe(0.8);
  });

  it("sleep recovery is halved while hungry", () => {
    const hunger = config.needs.sleepHungryThreshold - 0.01;
    const agent = makeAgent({
      body: { sleepRecoveryPerHour: 0.16, strength: 0.5, agility: 0.5 },
      needs: { hunger, energy: 0.2, social: 0.8, fun: 0.8 },
    });
    expect(advanceSleep(agent, 60).needs.energy).toBeCloseTo(0.28, 9);
  });

  it("sleep ends when rested or when starving", () => {
    const rested = makeAgent({ needs: { hunger: 0.8, energy: 1, social: 0.8, fun: 0.8 } });
    const starving = makeAgent({ needs: { hunger: 0.05, energy: 0.5, social: 0.8, fun: 0.8 } });
    const sleepy = makeAgent({ needs: { hunger: 0.8, energy: 0.5, social: 0.8, fun: 0.8 } });
    expect(findWakeReason(rested, 0)).toBe("rested");
    expect(findWakeReason(starving, 0)).toBe("hungry");
    expect(findWakeReason(sleepy, 0)).toBeNull();
  });

  it("a nap ends when its chosen length runs out", () => {
    const result = startSleep(makeAgent(), "Mara's bed", 100, 30, 1);
    if (!result.isSuccess) {
      throw new Error(result.reason);
    }
    expect(result.agent.currentAction).toMatchObject({
      kind: "sleep",
      target: "Mara's bed",
      endsAtTick: 130,
    });
    expect(findWakeReason(result.agent, 129)).toBeNull();
    expect(findWakeReason(result.agent, 130)).toBe("nap_over");
  });

  it("wakes into no action at all", () => {
    const result = startSleep(makeAgent(), "Mara's bed", 0);
    if (!result.isSuccess) {
      throw new Error(result.reason);
    }
    expect(isAsleep(result.agent)).toBe(true);
    expect(isAsleep(endSleep(result.agent))).toBe(false);
  });

  it("refuses to sleep while already asleep", () => {
    const asleep = startSleep(makeAgent(), "Mara's bed", 0);
    if (!asleep.isSuccess) throw new Error(asleep.reason);
    expect(startSleep(asleep.agent, "Mara's bed", 1)).toEqual({
      isSuccess: false,
      reason: "I'm already asleep",
    });
  });
});
