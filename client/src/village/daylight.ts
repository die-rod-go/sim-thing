import { toSimTime, type SimTimeSettings } from "@village/shared";

export interface DaylightKeyframe {
  hour: number;
  color: readonly [number, number, number];
  alpha: number;
}

const MINUTES_PER_HOUR = 60;

/** The sim hour as a fraction, e.g. 6.5 for 06:30. */
export function computeHourOfDay(tick: number, timeSettings: SimTimeSettings): number {
  const time = toSimTime(tick, timeSettings);
  return time.hour + time.minute / MINUTES_PER_HOUR;
}

/** The sky tint at an hour, blended between the surrounding keyframes, as a CSS rgba color. */
export function computeDaylightTint(hour: number, keyframes: readonly DaylightKeyframe[]): string {
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.hour > hour);
  const after = keyframes[nextIndex === -1 ? keyframes.length - 1 : nextIndex];
  const before = keyframes[nextIndex <= 0 ? 0 : nextIndex - 1];
  if (!before || !after) return "transparent";
  const span = after.hour - before.hour;
  const progress = span <= 0 ? 0 : Math.min(Math.max((hour - before.hour) / span, 0), 1);
  const blend = (from: number, to: number) => from + (to - from) * progress;
  const [red, green, blue] = before.color.map((channel, channelIndex) =>
    Math.round(blend(channel, after.color[channelIndex] ?? channel)),
  );
  const alpha = blend(before.alpha, after.alpha);
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}
