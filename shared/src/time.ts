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
const HOURS_PER_HALF_DAY = 12;

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
  return `Day ${time.day}, ${formatTimeOfDay(time)}`;
}

/** "6:05 am", "12:30 pm": twelve-hour clock time, without the day. */
export function formatTimeOfDay(time: Pick<SimTime, "hour" | "minute">): string {
  const period = time.hour < HOURS_PER_HALF_DAY ? "am" : "pm";
  const twelveHour = time.hour % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY;
  const minute = String(time.minute).padStart(2, "0");
  return `${twelveHour}:${minute} ${period}`;
}

export function simHoursBetween(fromTick: number, toTick: number, minutesPerTick: number): number {
  return ((toTick - fromTick) * minutesPerTick) / MINUTES_PER_HOUR;
}
