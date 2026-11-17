import {
  formatSimTime,
  formatTimeOfDay,
  toSimTime,
  type StreamEntry,
  type Summary,
} from "@village/shared";
import { config } from "../config";
import { measureWordOverlap } from "./word-overlap";

export const ELLIPSIS = "…";

/** What the speech words of a stream entry start after: `Tom said: "`. */
const SPEECH_WORDS_START = ': "';

/** Keeps a stream entry's text to `streamEntryMaxChars`, ending a cut text with an ellipsis. */
export function truncateEntryText(
  text: string,
  maxChars: number = config.memory.streamEntryMaxChars,
): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - ELLIPSIS.length).trimEnd() + ELLIPSIS;
}

/** One event to add to a stream: its text, and for speech who spoke and what. */
export interface NewStreamEntry {
  text: string;
  speech?: StreamEntry["speech"];
}

/** Whether the new entry repeats an earlier one: the same text, or near-same words by one speaker. */
function isRepeat(earlier: StreamEntry, entry: NewStreamEntry): boolean {
  if (earlier.text === entry.text) return true;
  if (earlier.speech === undefined || entry.speech === undefined) return false;
  if (earlier.speech.speakerId !== entry.speech.speakerId) return false;
  const similarity = measureWordOverlap(earlier.speech.words, entry.speech.words);
  return similarity >= config.memory.repeatMerge.minimumSimilarity;
}

function findRepeatIndex(
  stream: readonly StreamEntry[],
  entry: NewStreamEntry,
  tick: number,
  frozenCount: number,
): number {
  const { lookbackEntries, windowTicks } = config.memory.repeatMerge;
  const firstIndex = Math.max(frozenCount, stream.length - lookbackEntries);
  for (let index = stream.length - 1; index >= firstIndex; index -= 1) {
    const earlier = stream[index];
    if (earlier === undefined) continue;
    if (tick - (earlier.endTick ?? earlier.tick) > windowTicks) continue;
    if (isRepeat(earlier, entry)) return index;
  }
  return -1;
}

/**
 * The stream with one more event. An entry that repeats one of the agent's last few, recently,
 * replaces it at the end of the stream with the latest words, counting the repeats and spanning
 * their time, so the agent can see its own loop. The oldest `frozenCount` entries have been sent to
 * a summarizer and take no merges.
 */
export function appendStreamEntry(
  stream: readonly StreamEntry[],
  entry: NewStreamEntry,
  tick: number,
  frozenCount = 0,
  maxChars: number = config.memory.streamEntryMaxChars,
): StreamEntry[] {
  const text = truncateEntryText(entry.text, maxChars);
  const added: StreamEntry = { text, tick, ...(entry.speech ? { speech: entry.speech } : {}) };
  const repeatIndex = findRepeatIndex(stream, { ...entry, text }, tick, frozenCount);
  const earlier = stream[repeatIndex];
  if (earlier === undefined) return [...stream, added];
  const merged: StreamEntry = {
    ...added,
    tick: earlier.tick,
    count: (earlier.count ?? 1) + 1,
    endTick: tick,
  };
  return [...stream.slice(0, repeatIndex), ...stream.slice(repeatIndex + 1), merged];
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

/** `Tom said (×3): "..."` for speech, `I heard muffled sounds (×3)` for anything else. */
function addRepeatCount(entry: StreamEntry, count: number): string {
  const countText = fillText(config.memory.streamTexts.repeatCount, { count: String(count) });
  const wordsStart = entry.speech === undefined ? -1 : entry.text.indexOf(SPEECH_WORDS_START);
  if (wordsStart === -1) return `${entry.text} ${countText}`;
  return `${entry.text.slice(0, wordsStart)} ${countText}${entry.text.slice(wordsStart)}`;
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
    text: addRepeatCount(entry, entry.count),
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
