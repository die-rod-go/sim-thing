import { formatTimeOfDay, toSimTime, type SimTimeSettings } from "@village/shared";

export interface ClockFace {
  /** e.g. "Day 2 · 2:32 pm" */
  label: string;
  isDaytime: boolean;
}

export interface DaylightHours {
  dayStartHour: number;
  nightStartHour: number;
}

export function describeClockFace(
  tick: number,
  timeSettings: SimTimeSettings,
  daylight: DaylightHours,
): ClockFace {
  const time = toSimTime(tick, timeSettings);
  return {
    label: `Day ${time.day} · ${formatTimeOfDay(time)}`,
    isDaytime: time.hour >= daylight.dayStartHour && time.hour < daylight.nightStartHour,
  };
}
