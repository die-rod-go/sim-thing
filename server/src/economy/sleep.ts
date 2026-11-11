import type { Agent } from "@village/shared";
import { config } from "../config";
import { MINUTES_PER_HOUR, clampUnit, failWith, type MechanicResult } from "./types";

export type WakeReason = "rested" | "hungry" | "nap_over";

/** The current action's kind while asleep. */
export const SLEEP_ACTION = "sleep";

export function isAsleep(agent: Agent): boolean {
  return agent.currentAction?.kind === SLEEP_ACTION;
}

/** Why the agent can't fall asleep now, or null. */
export function findSleepBlocker(agent: Agent, napMinutes?: number): string | null {
  if (isAsleep(agent)) return "I'm already asleep";
  if (napMinutes !== undefined && !(napMinutes > 0)) {
    return "A nap needs a positive number of minutes";
  }
  return null;
}

/**
 * Puts the agent to sleep, as the `sleep` step does. Without `napMinutes` the sleep
 * lasts until a wake reason (or a sound loud enough). The action keeps the verb's name.
 */
export function startSleep(
  agent: Agent,
  bedName: string,
  tick: number,
  napMinutes?: number,
  minutesPerTick: number = config.clock.minutesPerTick,
): MechanicResult<{ agent: Agent }> {
  const blocker = findSleepBlocker(agent, napMinutes);
  if (blocker !== null) return failWith(blocker);
  const endsAtTick =
    napMinutes === undefined ? null : tick + Math.max(1, Math.ceil(napMinutes / minutesPerTick));
  return {
    isSuccess: true,
    agent: {
      ...agent,
      currentAction: {
        kind: SLEEP_ACTION,
        target: bedName,
        verb: agent.currentAction?.verb,
        endsAtTick,
      },
    },
  };
}

/** One tick of sleep: energy recovers at the agent's own rate, slower while hungry. */
export function advanceSleep(agent: Agent, minutesPerTick: number): Agent {
  const hungerMultiplier =
    agent.needs.hunger < config.needs.sleepHungryThreshold
      ? config.needs.sleepRecoveryHungryMultiplier
      : 1;
  const recovery =
    agent.body.sleepRecoveryPerHour * (minutesPerTick / MINUTES_PER_HOUR) * hungerMultiplier;
  return { ...agent, needs: { ...agent.needs, energy: clampUnit(agent.needs.energy + recovery) } };
}

/** Why a sleeping agent wakes on its own this tick, or null to keep sleeping. */
export function findWakeReason(agent: Agent, tick: number): WakeReason | null {
  if (agent.needs.energy >= 1) {
    return "rested";
  }
  if (agent.needs.hunger < config.needs.sleepWakeHungerThreshold) {
    return "hungry";
  }
  const endsAtTick = agent.currentAction?.endsAtTick ?? null;
  if (endsAtTick !== null && tick >= endsAtTick) {
    return "nap_over";
  }
  return null;
}

/** Wakes the agent, for any reason. */
export function endSleep(agent: Agent): Agent {
  return { ...agent, currentAction: null };
}
