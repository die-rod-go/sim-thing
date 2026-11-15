import { describe, expect, it } from "vitest";
import { config } from "../config";
import { computeHitChance, pickWithinRange, scaleByStrength } from "./combat";

const AVERAGE = 0.5;

function awakeDefender(agility: number) {
  return { kind: "dodging", agility, isAsleep: false, isUser: false } as const;
}

describe("hit chance", () => {
  it("rises with the attacker's agility over the defender's", () => {
    expect(computeHitChance(0.7, AVERAGE, awakeDefender(AVERAGE))).toBeCloseTo(0.7, 9);
    expect(computeHitChance(0.7, 0.7, awakeDefender(0.5))).toBeCloseTo(0.8, 9);
    expect(computeHitChance(0.7, 0.3, awakeDefender(0.5))).toBeCloseTo(0.6, 9);
  });

  it("clamps the chance between the configured floor and ceiling", () => {
    expect(computeHitChance(0.9, 1, awakeDefender(0))).toBe(config.combat.maxHitChance);
    expect(computeHitChance(0.1, 0, awakeDefender(1))).toBe(config.combat.minHitChance);
  });

  it("always hits a sleeper, the user itself and things", () => {
    const sleeper = { kind: "dodging", agility: 1, isAsleep: true, isUser: false } as const;
    expect(computeHitChance(0.1, 0, sleeper)).toBe(1);
    expect(computeHitChance(0.1, 0, { ...awakeDefender(1), isUser: true })).toBe(1);
    expect(computeHitChance(0.1, 0, { kind: "still" })).toBe(1);
  });
});

describe("damage", () => {
  it("scales with the attacker's strength around average", () => {
    expect(scaleByStrength(0.2, AVERAGE)).toBeCloseTo(0.2, 9);
    expect(scaleByStrength(0.2, 1)).toBeCloseTo(0.26, 9);
    expect(scaleByStrength(0.2, 0)).toBeCloseTo(0.14, 9);
  });

  it("is picked within its range by the roll", () => {
    expect(pickWithinRange({ min: 0.2, max: 0.4 }, 0)).toBeCloseTo(0.2, 9);
    expect(pickWithinRange({ min: 0.2, max: 0.4 }, 0.5)).toBeCloseTo(0.3, 9);
  });
});
