export interface SimTimeSettings {
  minutesPerTick: number;
  startHour: number;
}

export interface SimTime {
  day: number;
  hour: number;
  minute: number;
}

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

export function toSimTime(tick: number, settings: SimTimeSettings): SimTime {
  const totalMinutes = settings.startHour * MINUTES_PER_HOUR + tick * settings.minutesPerTick;
  return {
    day: Math.floor(totalMinutes / MINUTES_PER_DAY) + 1,
    hour: Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minute: totalMinutes % MINUTES_PER_HOUR,
  };
}

export function formatSimTime(tick: number, settings: SimTimeSettings): string {
  const time = toSimTime(tick, settings);
  const hour = String(time.hour).padStart(2, "0");
  const minute = String(time.minute).padStart(2, "0");
  return `Day ${time.day}, ${hour}:${minute}`;
}

export function simHoursBetween(fromTick: number, toTick: number, minutesPerTick: number): number {
  return ((toTick - fromTick) * minutesPerTick) / MINUTES_PER_HOUR;
}
