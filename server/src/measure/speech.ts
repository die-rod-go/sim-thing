import { config } from "../config";
import { measureWordOverlap } from "../memory/word-overlap";
import type { SpeechRecord, StreamLine } from "./records";

export interface NearRepeatSummary {
  lines: number;
  nearRepeats: number;
  rate: number;
}

/** Lines that overlap one of the speaker's own last few lines by more than the threshold. */
export function measureNearRepeats(speech: readonly SpeechRecord[]): NearRepeatSummary {
  const { nearRepeatLookbackLines, nearRepeatSimilarity } = config.measure;
  const earlierBySpeaker = new Map<string, string[]>();
  let nearRepeats = 0;
  for (const line of speech) {
    const earlier = earlierBySpeaker.get(line.speakerId) ?? [];
    const isNearRepeat = earlier.some(
      (words) => measureWordOverlap(words, line.words) > nearRepeatSimilarity,
    );
    if (isNearRepeat) nearRepeats += 1;
    earlierBySpeaker.set(line.speakerId, [...earlier, line.words].slice(-nearRepeatLookbackLines));
  }
  return { lines: speech.length, nearRepeats, rate: nearRepeats / Math.max(1, speech.length) };
}

export interface ConversationSummary {
  /** Runs of talk at one place between at least two speakers. */
  count: number;
  meanLines: number;
  medianLines: number;
  longestLines: number;
}

interface OpenConversation {
  lastTick: number;
  speakerIds: Set<string>;
  lines: number;
}

/**
 * Talk grouped into conversations: a line joins the one at its place if that one's last line was
 * within `measure.conversationGapMinutes`, and starts a new one otherwise.
 */
export function measureConversations(speech: readonly SpeechRecord[]): ConversationSummary {
  const gapTicks = config.measure.conversationGapMinutes / config.clock.minutesPerTick;
  const openByPlace = new Map<string, OpenConversation>();
  const finished: OpenConversation[] = [];
  for (const line of speech) {
    const open = openByPlace.get(line.place);
    if (open !== undefined && line.tick - open.lastTick <= gapTicks) {
      open.lastTick = line.tick;
      open.speakerIds.add(line.speakerId);
      open.lines += 1;
      continue;
    }
    if (open !== undefined) finished.push(open);
    openByPlace.set(line.place, {
      lastTick: line.tick,
      speakerIds: new Set([line.speakerId]),
      lines: 1,
    });
  }
  const lengths = [...finished, ...openByPlace.values()]
    .filter((conversation) => conversation.speakerIds.size >= 2)
    .map((conversation) => conversation.lines)
    .sort((first, second) => first - second);
  return {
    count: lengths.length,
    meanLines: lengths.reduce((sum, lines) => sum + lines, 0) / Math.max(1, lengths.length),
    medianLines: lengths[Math.floor(lengths.length / 2)] ?? 0,
    longestLines: lengths[lengths.length - 1] ?? 0,
  };
}

const OVERHEARD_PATTERN = /^I overheard (.+?) (?:say|whisper|shout): "(.*)"$/;

export interface PassedOnSummary {
  overheard: number;
  passedOn: number;
}

/**
 * Overheard lines the hearer later said something like, in its own speech: the brief's test that
 * an agent mentions something it overheard.
 */
export function measurePassedOn(
  streamLines: readonly StreamLine[],
  speech: readonly SpeechRecord[],
): PassedOnSummary {
  const overheard = streamLines.flatMap((line) => {
    const words = OVERHEARD_PATTERN.exec(line.text)?.[2];
    return words === undefined ? [] : [{ hearerId: line.agentId, tick: line.tick, words }];
  });
  const passedOn = overheard.filter((heard) =>
    speech.some(
      (line) =>
        line.speakerId === heard.hearerId &&
        line.tick > heard.tick &&
        measureWordOverlap(line.words, heard.words) >= config.measure.passedOnSimilarity,
    ),
  );
  return { overheard: overheard.length, passedOn: passedOn.length };
}
