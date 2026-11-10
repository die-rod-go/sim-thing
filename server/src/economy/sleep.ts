import type { Agent, WorldObject } from "@village/shared";
import { config } from "../config";
import { addObjectUser, removeObjectUser } from "./object-state";
import {
  MINUTES_PER_HOUR,
  clampUnit,
  failWith,
  type InteractionRecord,
  type MechanicResult,
} from "./types";

export type WakeReason = "rested" | "hungry" | "nap_over";

export const SLEEP_INTERACTION = "sleep";

export function isAsleep(agent: Agent): boolean {
  return agent.currentAction?.kind === SLEEP_INTERACTION;
}

/**
 * Puts the agent to sleep in a bed. Without `napMinutes` the sleep lasts until a wake reason
 * (or a sound integration decides is loud enough). The returned record keeps the start tick.
 */
export function startSleep(
  agent: Agent,
  bed: WorldObject,
  tick: number,
  napMinutes?: number,
  minutesPerTick: number = config.clock.minutesPerTick,
): MechanicResult<{ agent: Agent; bed: WorldObject; record: InteractionRecord }> {
  if (!config.objects[bed.kind].interactions.includes(SLEEP_INTERACTION)) {
    return failWith(`I can't sleep in ${bed.name}`);
  }
  if (isAsleep(agent)) {
    return failWith("I'm already asleep");
  }
  if (napMinutes !== undefined && !(napMinutes > 0)) {
    return failWith("A nap needs a positive number of minutes");
  }
  const endsAtTick =
    napMinutes === undefined ? null : tick + Math.max(1, Math.ceil(napMinutes / minutesPerTick));
  return {
    isSuccess: true,
    agent: {
      ...agent,
      currentAction: { kind: SLEEP_INTERACTION, target: bed.name, endsAtTick },
    },
    bed: addObjectUser(bed, agent.id),
    record: {
      agentId: agent.id,
      interaction: SLEEP_INTERACTION,
      targetName: bed.name,
      objectId: bed.id,
      startedAtTick: tick,
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

/** Wakes the agent, for any reason, and frees the bed. */
export function endSleep(agent: Agent, bed: WorldObject): { agent: Agent; bed: WorldObject } {
  return { agent: { ...agent, currentAction: null }, bed: removeObjectUser(bed, agent.id) };
}
