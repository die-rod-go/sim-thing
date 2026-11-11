import { toSimTime, type SimTimeSettings } from "@village/shared";

export interface ClockFace {
  /** e.g. "Day 2 · 14:32" */
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
  const hour = String(time.hour).padStart(2, "0");
  const minute = String(time.minute).padStart(2, "0");
  return {
    label: `Day ${time.day} · ${hour}:${minute}`,
    isDaytime: time.hour >= daylight.dayStartHour && time.hour < daylight.nightStartHour,
  };
}
