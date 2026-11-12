import { EVENT_CATEGORIES, type EventCategory } from "./event-feed";
import type { StoryFilter } from "./story-feed";

/** Parsers for values read back from localStorage, which may be missing, stale or hand-edited. */

export function parseStoredNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}

export function parseStoredBoolean(raw: string | null): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function parseStoredChoice<Choice extends string>(
  raw: string | null,
  choices: readonly Choice[],
): Choice | null {
  return choices.find((choice) => choice === raw) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function isEventCategory(value: unknown): value is EventCategory {
  return EVENT_CATEGORIES.some((category) => category === value);
}

export function parseStoredStoryFilter(raw: string | null): StoryFilter | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.categories)) return null;
  return {
    agentId: readNullableString(parsed, "agentId"),
    place: readNullableString(parsed, "place"),
    categories: new Set(parsed.categories.filter(isEventCategory)),
    isShowingMoments: parsed.isShowingMoments === true,
    isShowingActionsInThreads: parsed.isShowingActionsInThreads === true,
  };
}

export function serializeStoryFilter(filter: StoryFilter): string {
  return JSON.stringify({
    agentId: filter.agentId,
    place: filter.place,
    categories: [...filter.categories],
    isShowingMoments: filter.isShowingMoments,
    isShowingActionsInThreads: filter.isShowingActionsInThreads,
  });
}
