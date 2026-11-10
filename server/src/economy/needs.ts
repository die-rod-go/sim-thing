import { NEED_NAMES, type Agent, type NeedName, type Needs } from "@village/shared";
import { config } from "../config";
import { MINUTES_PER_DAY, clampUnit } from "./types";

export interface NeedDecayOptions {
  isAsleep: boolean;
  minutesPerTick: number;
}

/**
 * One tick of need decay. While asleep, energy is left alone (sleep recovery handles it) and the
 * other needs decay at `sleepDecayMultiplier` of their awake rate.
 */
export function decayNeeds(agent: Agent, options: NeedDecayOptions): Agent {
  const dayFraction = options.minutesPerTick / MINUTES_PER_DAY;
  const needs = { ...agent.needs };
  for (const need of NEED_NAMES) {
    if (options.isAsleep && need === "energy") {
      continue;
    }
    const sleepMultiplier = options.isAsleep ? config.needs.sleepDecayMultiplier : 1;
    const decay =
      config.needs.decayPerDayAwake[need] *
      dayFraction *
      sleepMultiplier *
      computePersonalDecayMultiplier(agent, need);
    needs[need] = clampUnit(needs[need] - decay);
  }
  return { ...agent, needs };
}

function computePersonalDecayMultiplier(agent: Agent, need: NeedName): number {
  if (need !== "social") {
    return 1;
  }
  return 1 + agent.personality.traits.extraversion * config.needs.socialDecayExtraversionSpread;
}

/** One tick among a crowd: extroverts gain social, introverts lose energy. */
export function applyCrowdEffect(agent: Agent, othersInSightCount: number): Agent {
  if (othersInSightCount < config.needs.crowdSize) {
    return agent;
  }
  const extraversion = agent.personality.traits.extraversion;
  const strength = Math.abs(extraversion);
  if (extraversion > 0) {
    return {
      ...agent,
      needs: applyNeedEffects(agent.needs, {
        social: config.needs.crowdSocialGainPerTick * strength,
      }),
    };
  }
  if (extraversion < 0) {
    return {
      ...agent,
      needs: applyNeedEffects(agent.needs, {
        energy: -config.needs.crowdEnergyCostPerTick * strength,
      }),
    };
  }
  return agent;
}

export function applyNeedEffects(needs: Needs, effects: Partial<Record<NeedName, number>>): Needs {
  const updated = { ...needs };
  for (const need of NEED_NAMES) {
    updated[need] = clampUnit(updated[need] + (effects[need] ?? 0));
  }
  return updated;
}

/** Social gained for one line said or heard while taking part in a conversation. */
export function addConversationSocial(needs: Needs): Needs {
  return applyNeedEffects(needs, { social: config.needs.socialPerConversationLine });
}

/** Needs that just dropped below the decision threshold, which give the agent a decision. */
export function findCrossedThresholds(before: Needs, after: Needs): NeedName[] {
  const threshold = config.needs.decisionThreshold;
  return NEED_NAMES.filter((need) => before[need] >= threshold && after[need] < threshold);
}
