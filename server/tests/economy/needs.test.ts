import { describe, expect, it } from "vitest";
import type { Agent } from "@village/shared";
import { config } from "../../src/config";
import {
  addConversationSocial,
  applyCrowdEffect,
  applyNeedEffects,
  decayNeeds,
  findCrossedThresholds,
} from "../../src/economy/needs";
import { makeAgent, withExtraversion } from "./test-fixtures";
import { MINUTES_PER_DAY } from "../../src/economy/types";

const full = { hunger: 1, energy: 1, social: 1, fun: 1 };

function decayForOneDay(agent: Agent, isAsleep: boolean): Agent {
  let current = agent;
  for (let minute = 0; minute < MINUTES_PER_DAY; minute++) {
    current = decayNeeds(current, { isAsleep, minutesPerTick: 1 });
  }
  return current;
}

describe("needs decay", () => {
  it("each need falls by its daily rate over a sim-day awake", () => {
    const agent = decayForOneDay(makeAgent({ needs: { ...full } }), false);
    const rates = config.needs.decayPerDayAwake;
    expect(agent.needs.hunger).toBeCloseTo(Math.max(0, 1 - rates.hunger), 6);
    expect(agent.needs.energy).toBeCloseTo(Math.max(0, 1 - rates.energy), 6);
    expect(agent.needs.fun).toBeCloseTo(Math.max(0, 1 - rates.fun), 6);
  });

  it("social decays faster for an extrovert", () => {
    const options = { isAsleep: false, minutesPerTick: 60 };
    const extrovert = decayNeeds(withExtraversion(makeAgent(), 1), options);
    const introvert = decayNeeds(withExtraversion(makeAgent(), -1), options);
    const extrovertLoss = 0.8 - extrovert.needs.social;
    const introvertLoss = 0.8 - introvert.needs.social;
    expect(extrovertLoss).toBeCloseTo(introvertLoss * 3, 6);
  });

  it("needs decay at the sleep rate while asleep", () => {
    const agent = decayForOneDay(makeAgent({ needs: { ...full } }), true);
    const rates = config.needs.decayPerDayAwake;
    const multiplier = config.needs.sleepDecayMultiplier;
    expect(agent.needs.hunger).toBeCloseTo(Math.max(0, 1 - rates.hunger * multiplier), 6);
    expect(agent.needs.fun).toBeCloseTo(Math.max(0, 1 - rates.fun * multiplier), 6);
  });

  it("leaves energy to sleep recovery while asleep", () => {
    const agent = decayNeeds(makeAgent(), { isAsleep: true, minutesPerTick: 60 });
    expect(agent.needs.energy).toBe(0.8);
  });

  it("never lets a need fall below zero", () => {
    const agent = makeAgent({ needs: { hunger: 0, energy: 0, social: 0, fun: 0 } });
    const decayed = decayNeeds(agent, { isAsleep: false, minutesPerTick: 60 });
    expect(decayed.needs).toEqual({ hunger: 0, energy: 0, social: 0, fun: 0 });
  });

  it("does not change the agent passed in", () => {
    const agent = makeAgent();
    decayNeeds(agent, { isAsleep: false, minutesPerTick: 60 });
    expect(agent.needs.hunger).toBe(0.8);
  });
});

describe("crowds", () => {
  it("an introvert in a crowd loses energy", () => {
    const agent = applyCrowdEffect(withExtraversion(makeAgent(), -0.5), config.needs.crowdSize);
    expect(agent.needs.energy).toBeCloseTo(0.8 - config.needs.crowdEnergyCostPerTick * 0.5, 9);
    expect(agent.needs.social).toBe(0.8);
  });

  it("an extrovert in a crowd gains social", () => {
    const agent = applyCrowdEffect(withExtraversion(makeAgent(), 1), config.needs.crowdSize + 2);
    expect(agent.needs.social).toBeCloseTo(0.8 + config.needs.crowdSocialGainPerTick, 9);
    expect(agent.needs.energy).toBe(0.8);
  });

  it("a small group is not a crowd", () => {
    const agent = withExtraversion(makeAgent(), -1);
    expect(applyCrowdEffect(agent, config.needs.crowdSize - 1)).toBe(agent);
  });
});

describe("need effects", () => {
  it("clamps need effects to 0..1", () => {
    const needs = applyNeedEffects(
      { hunger: 0.9, energy: 0.05, social: 0.5, fun: 0.5 },
      {
        hunger: 0.5,
        energy: -0.1,
      },
    );
    expect(needs).toEqual({ hunger: 1, energy: 0, social: 0.5, fun: 0.5 });
  });

  it("a conversation line adds social", () => {
    const needs = addConversationSocial({ hunger: 0.5, energy: 0.5, social: 0.5, fun: 0.5 });
    expect(needs.social).toBeCloseTo(0.5 + config.needs.socialPerConversationLine, 9);
  });

  it("reports only needs that just dropped below the decision threshold", () => {
    const before = { hunger: 0.21, energy: 0.1, social: 0.5, fun: 0.21 };
    const after = { hunger: 0.19, energy: 0.09, social: 0.49, fun: 0.2 };
    expect(findCrossedThresholds(before, after)).toEqual(["hunger"]);
  });
});
