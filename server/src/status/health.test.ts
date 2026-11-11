import { describe, expect, it } from "vitest";
import { config } from "../config";
import { makeAgent } from "../economy/test-fixtures";
import {
  computeStarvationDamage,
  describeHealthAsSeen,
  findCrossedHealthThresholds,
  regenerateHealth,
  trackStarvation,
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

  it("kills an agent who starts fed and never eats in about two days", () => {
    const hoursToEmpty = (config.needs.startValue / config.needs.decayPerDayAwake.hunger) * 24;
    const hoursToDie =
      hoursToEmpty + config.health.starvationGraceHours + 1 / config.health.starvationDrainPerHour;
    expect(hoursToDie).toBeGreaterThan(36);
    expect(hoursToDie).toBeLessThan(60);
  });
});

describe("regeneration", () => {
  const hurt = 0.5;
  const regenNeeds = { ...fed, hunger: config.health.regenHungerThreshold + 0.1 };

  it("heals slowly while awake", () => {
    const agent = makeAgent({ health: hurt, needs: regenNeeds });
    const healed = regenerateHealth(agent, { isAsleep: false, minutesPerTick: MINUTES_PER_HOUR });
    expect(healed.health).toBeCloseTo(hurt + config.health.regenPerHourAwake, 12);
  });

  it("heals faster while asleep", () => {
    const agent = makeAgent({ health: hurt, needs: regenNeeds });
    const healed = regenerateHealth(agent, { isAsleep: true, minutesPerTick: MINUTES_PER_HOUR });
    expect(healed.health).toBeCloseTo(hurt + config.health.regenPerHourAsleep, 12);
  });

  it("doesn't heal while hunger is at or below the threshold", () => {
    const hungry = { ...fed, hunger: config.health.regenHungerThreshold };
    const agent = makeAgent({ health: hurt, needs: hungry });
    expect(regenerateHealth(agent, { isAsleep: true, minutesPerTick: 60 }).health).toBe(hurt);
  });

  it("never heals past full health", () => {
    const agent = makeAgent({ health: 0.9999, needs: regenNeeds });
    expect(regenerateHealth(agent, { isAsleep: true, minutesPerTick: 600 }).health).toBe(1);
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
    expect(describeHealthAsSeen(0.3)).toBe("looks badly wounded");
  });
});
