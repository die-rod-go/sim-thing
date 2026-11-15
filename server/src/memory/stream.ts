import {
  formatSimTime,
  formatTimeOfDay,
  toSimTime,
  type StreamEntry,
  type Summary,
} from "@village/shared";
import { config } from "../config";

export const ELLIPSIS = "…";

/** Keeps a stream entry's text to `streamEntryMaxChars`, ending a cut text with an ellipsis. */
export function truncateEntryText(
  text: string,
  maxChars: number = config.memory.streamEntryMaxChars,
): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - ELLIPSIS.length).trimEnd() + ELLIPSIS;
}

/**
 * The stream with one more event. Text identical to the entry just before it is merged into that
 * entry, which then counts its repeats and spans their time, so a merged entry counts once.
 * `canMergeIntoLast` is false when the last entry has been sent to a summarizer.
 */
export function appendStreamEntry(
  stream: readonly StreamEntry[],
  text: string,
  tick: number,
  canMergeIntoLast = true,
): StreamEntry[] {
  const entryText = truncateEntryText(text);
  const last = stream[stream.length - 1];
  if (last === undefined || last.text !== entryText || !canMergeIntoLast) {
    return [...stream, { text: entryText, tick }];
  }
  const merged: StreamEntry = { ...last, count: (last.count ?? 1) + 1, endTick: tick };
  return [...stream.slice(0, -1), merged];
}

function fillText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}

/** The end of a span: only the time of day when it ends on the day it began. */
function describeEndTime(startTick: number, endTick: number): string {
  const start = toSimTime(startTick, config.clock);
  const end = toSimTime(endTick, config.clock);
  return start.day === end.day ? formatTimeOfDay(end) : formatSimTime(endTick, config.clock);
}

/** "[Day 1, 6:32 am] I saw that ..."; a merged repeat shows its span and how many times. */
export function describeStreamEntry(entry: StreamEntry): string {
  const texts = config.memory.streamTexts;
  const time = formatSimTime(entry.tick, config.clock);
  if (entry.count === undefined || entry.endTick === undefined) {
    return fillText(texts.entry, { time, text: entry.text });
  }
  return fillText(texts.repeated, {
    time,
    endTime: describeEndTime(entry.tick, entry.endTick),
    text: entry.text,
    count: String(entry.count),
  });
}

/** "[Day 1, 6:00 am to 9:14 am] I baked and sold bread ...": a summary with the span it covers. */
export function describeSummary(summary: Summary): string {
  return fillText(config.memory.summaryText, {
    time: formatSimTime(summary.startTick, config.clock),
    endTime: describeEndTime(summary.startTick, summary.endTick),
    text: summary.text,
  });
}
