const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT = 100;

const countFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * PERCENT)}%`;
}

export function formatMinutesAgo(minutes: number): string {
  if (minutes <= 0) return "just now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainingMinutes = minutes % MINUTES_PER_HOUR;
  return remainingMinutes === 0 ? `${hours} h ago` : `${hours} h ${remainingMinutes} min ago`;
}

export function formatLatency(latencyMs: number): string {
  if (latencyMs < MILLISECONDS_PER_SECOND) return `${latencyMs} ms`;
  return `${(latencyMs / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
}

/** Real milliseconds per tick at the given speed, capped so slow speeds stay responsive. */
export function computeTickDurationMs(
  baseTicksPerSecond: number,
  speed: number,
  maxDurationMs: number,
): number {
  const ticksPerSecond = baseTicksPerSecond * speed;
  if (ticksPerSecond <= 0) return maxDurationMs;
  return Math.min(MILLISECONDS_PER_SECOND / ticksPerSecond, maxDurationMs);
}

/** Pretty-prints any parsed reply; strings are returned as-is. */
export function formatParsedReply(parsed: unknown): string {
  if (parsed === undefined || parsed === null) return "(nothing parsed)";
  if (typeof parsed === "string") return parsed;
  return JSON.stringify(parsed, null, 2);
}

/** Parses a positive whole number from a text field, or null when it isn't one. */
export function parsePositiveInteger(text: string): number | null {
  const trimmed = text.replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
