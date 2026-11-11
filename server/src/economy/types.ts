export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** A failed act, with a plain first-person reason the agent can learn from. */
export interface MechanicFailure {
  isSuccess: false;
  reason: string;
}

export type MechanicResult<Success> = ({ isSuccess: true } & Success) | MechanicFailure;

export function failWith(reason: string): MechanicFailure {
  return { isSuccess: false, reason };
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
