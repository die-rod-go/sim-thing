import { simHoursBetween, toSimTime } from "@village/shared";
import { config } from "../config";

/** Per-agent reflection bookkeeping; integration persists a `Record<agentId, ReflectionSchedule>`. */
export interface ReflectionSchedule {
  lastNightPassTick: number | null;
  nightPassCount: number;
  /** Set while the agent sleeps; null while awake. */
  sleepStartedAtTick: number | null;
  /** When the agent last reflected or woke; the daytime pass counts from here. Null before either. */
  lastReflectionTick: number | null;
}

export interface NightPassCheck {
  isStartingSleep: boolean;
}

export function createReflectionSchedule(): ReflectionSchedule {
  return {
    lastNightPassTick: null,
    nightPassCount: 0,
    sleepStartedAtTick: null,
    lastReflectionTick: null,
  };
}

function hoursSince(fromTick: number, toTick: number): number {
  return simHoursBetween(fromTick, toTick, config.clock.minutesPerTick);
}

export function recordSleepStart(schedule: ReflectionSchedule, tick: number): ReflectionSchedule {
  return { ...schedule, sleepStartedAtTick: tick };
}

export function recordWake(schedule: ReflectionSchedule, tick: number): ReflectionSchedule {
  return { ...schedule, sleepStartedAtTick: null, lastReflectionTick: tick };
}

export function recordNightPass(schedule: ReflectionSchedule, tick: number): ReflectionSchedule {
  return {
    ...schedule,
    lastNightPassTick: tick,
    nightPassCount: schedule.nightPassCount + 1,
    lastReflectionTick: tick,
  };
}

export function recordDaytimePass(schedule: ReflectionSchedule, tick: number): ReflectionSchedule {
  return { ...schedule, lastReflectionTick: tick };
}

/** Where the daytime pass's memories start: the last reflection or waking, else the sim start. */
export function findDaytimeWindowStart(schedule: ReflectionSchedule): number {
  return schedule.lastReflectionTick ?? 0;
}

/** Due for an awake agent `daytimeEveryHours` after its last reflection or waking. */
export function isDaytimePassDue(schedule: ReflectionSchedule, tick: number): boolean {
  if (schedule.sleepStartedAtTick !== null) return false;
  return hoursSince(findDaytimeWindowStart(schedule), tick) >= config.reflection.daytimeEveryHours;
}

/** Check before `recordWake`: true when the sleep that just ended lasted `morningMinSleepHours`. */
export function isMorningPassDue(schedule: ReflectionSchedule, wakeTick: number): boolean {
  if (schedule.sleepStartedAtTick === null) return false;
  return (
    hoursSince(schedule.sleepStartedAtTick, wakeTick) >= config.reflection.morningMinSleepHours
  );
}

function hasNightPassInCooldown(schedule: ReflectionSchedule, tick: number): boolean {
  if (schedule.lastNightPassTick === null) return false;
  return hoursSince(schedule.lastNightPassTick, tick) < config.reflection.nightCooldownHours;
}

/**
 * Due when the agent starts a sleep, or during the `nightForcedHour` sim-hour while still awake,
 * unless a night pass already ran within `nightCooldownHours`.
 */
export function isNightPassDue(
  schedule: ReflectionSchedule,
  tick: number,
  check: NightPassCheck,
): boolean {
  if (hasNightPassInCooldown(schedule, tick)) return false;
  if (check.isStartingSleep) return true;
  const isAwake = schedule.sleepStartedAtTick === null;
  return isAwake && toSimTime(tick, config.clock).hour === config.reflection.nightForcedHour;
}

/** Check after `recordNightPass`: every `weeklyEveryNights`-th night pass is followed by a weekly one. */
export function isWeeklyPassDue(schedule: ReflectionSchedule): boolean {
  return (
    schedule.nightPassCount > 0 &&
    schedule.nightPassCount % config.reflection.weeklyEveryNights === 0
  );
}
