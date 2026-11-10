export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** A failed act, with a plain first-person reason the agent can learn from. */
export interface MechanicFailure {
  isSuccess: false;
  reason: string;
}

export type MechanicResult<Success> = ({ isSuccess: true } & Success) | MechanicFailure;

/**
 * What an agent is doing right now with an object or held item. `Agent.currentAction` only keeps
 * kind, target and end tick, so integration keeps this record (e.g. in a map by agent id) to know
 * which interaction to finish and, for sleep, when it started.
 */
export interface InteractionRecord {
  agentId: string;
  /** Canonical interaction name from config, e.g. "bake bread". */
  interaction: string;
  /** Object name or held item name. */
  targetName: string;
  /** Id of the object used; null for held items. */
  objectId: string | null;
  startedAtTick: number;
}

export function failWith(reason: string): MechanicFailure {
  return { isSuccess: false, reason };
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
