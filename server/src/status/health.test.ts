import { readAgentHealth } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { makeAgent } from "../economy/test-fixtures";
import { loadTestItems } from "../sim/test-sim";
import {
  computeStarvationDamage,
  describeHealthAsSeen,
  findCrossedHealthThresholds,
  computeRegeneration,
  trackStarvation,
  withAgentHealth,
} from "./health";

const MINUTES_PER_HOUR = 60;
const graceTicks = config.health.starvationGraceHours * MINUTES_PER_HOUR;
const fed = { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 };
const starving = { ...fed, hunger: 0 };

describe("starvation", () => {
  it("starts the starvation clock when hunger reaches zero and clears it once fed", () => {
    const started = trackStarvation(makeAgent({ needs: starving }), 100);
    expect(started.starvingSinceTick).toBe(100);
    expect(trackStarvation(started, 200).starvingSinceTick).toBe(100);
    expect(trackStarvation({ ...started, needs: fed }, 200).starvingSinceTick).toBeNull();
  });

  it("does no damage during the grace period", () => {
    const agent = makeAgent({ needs: starving, starvingSinceTick: 0 });
    expect(computeStarvationDamage(agent, graceTicks - 1, 1)).toBe(0);
  });

  it("drains health at the starvation rate after the grace period", () => {
    const agent = makeAgent({ needs: starving, starvingSinceTick: 0 });
    const perTick = config.health.starvationDrainPerHour / MINUTES_PER_HOUR;
    expect(computeStarvationDamage(agent, graceTicks, 1)).toBeCloseTo(perTick, 12);
  });
});

describe("regeneration", () => {
  const regenNeeds = { ...fed, hunger: config.health.regenHungerThreshold + 0.1 };

  it("heals slowly while awake", () => {
    const agent = makeAgent({ needs: regenNeeds });
    const gained = computeRegeneration(agent, {
      isAsleep: false,
      minutesPerTick: MINUTES_PER_HOUR,
    });
    expect(gained).toBeCloseTo(config.health.regenPerHourAwake, 12);
  });

  it("heals faster while asleep", () => {
    const agent = makeAgent({ needs: regenNeeds });
    const gained = computeRegeneration(agent, { isAsleep: true, minutesPerTick: MINUTES_PER_HOUR });
    expect(gained).toBeCloseTo(config.health.regenPerHourAsleep, 12);
  });

  it("doesn't heal while hunger is at or below the threshold", () => {
    const hungry = { ...fed, hunger: config.health.regenHungerThreshold };
    const agent = makeAgent({ needs: hungry });
    expect(computeRegeneration(agent, { isAsleep: true, minutesPerTick: 60 })).toBe(0);
  });
});

describe("writing an agent's health", () => {
  const items = loadTestItems();

  it("never heals past full health", () => {
    const agent = withAgentHealth(items, makeAgent(), 0.9999);
    expect(readAgentHealth(items, withAgentHealth(items, agent, 1.5))).toBe(1);
  });

  it("never goes below 0", () => {
    expect(readAgentHealth(items, withAgentHealth(items, makeAgent(), -2))).toBe(0);
  });

  it("keeps no override while health equals the body's own value", () => {
    const hurt = withAgentHealth(items, makeAgent(), 0.4);
    expect(hurt.bodyChanges).not.toEqual({});
    expect(withAgentHealth(items, hurt, 1).bodyChanges).toEqual({});
  });
});

describe("health thresholds and words", () => {
  it("reports each decision threshold health dropped below", () => {
    expect(findCrossedHealthThresholds(0.9, 0.2)).toEqual([0.5, 0.25]);
    expect(findCrossedHealthThresholds(0.4, 0.3)).toEqual([]);
    expect(findCrossedHealthThresholds(0.3, 0.6)).toEqual([]);
  });

  it("only shows others' health once it drops below the visible threshold", () => {
    expect(describeHealthAsSeen(config.health.visibleToOthersBelow)).toBeNull();
    expect(describeHealthAsSeen(0.3)).toBe("looks in a bad way");
  });
});
