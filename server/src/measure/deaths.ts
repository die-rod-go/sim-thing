import { config } from "../config";
import { isOwnNameMentioned } from "../perception/interrupts";
import { buildNameGrouper } from "./grouping";
import type { SaveRecords, StreamLine } from "./records";

export interface DeathNotice {
  name: string;
  diedAtTick: number;
  /** Who first saw them dead or dying, and when; null when nobody did. */
  finderName: string | null;
  firstSeenTick: number | null;
  /** The first time someone other than the finder said their name, after it was seen. */
  firstMentionByOthersTick: number | null;
  firstMentionByFinderTick: number | null;
}

/** Whether the stream line is its agent seeing the death or the body. */
function isDeathSeen(line: StreamLine, name: string): boolean {
  const body = config.death.bodyName.split("{name}").join(name);
  const sawDying = `I saw that ${name} ${config.death.eventDescription}`;
  return line.text.includes(body) || line.text.startsWith(sawDying);
}

/** For each death: when it was first seen, and how long before anyone spoke of the dead. */
export function measureDeathNotice(records: SaveRecords): DeathNotice[] {
  return records.deaths.map((death) => {
    const name = records.agentNames[death.agentId] ?? death.agentId;
    const firstSight = records.streamLines.find(
      (line) =>
        line.tick >= death.tick && line.agentId !== death.agentId && isDeathSeen(line, name),
    );
    const firstSeenTick = firstSight?.tick ?? null;
    const findMention = (isSpeaker: (speakerId: string) => boolean) =>
      firstSeenTick === null
        ? null
        : (records.speech.find(
            (line) =>
              line.tick >= firstSeenTick &&
              line.speakerId !== death.agentId &&
              isSpeaker(line.speakerId) &&
              isOwnNameMentioned(line.words, name),
          )?.tick ?? null);
    const finderId = firstSight?.agentId ?? null;
    return {
      name,
      diedAtTick: death.tick,
      finderName: finderId === null ? null : (records.agentNames[finderId] ?? finderId),
      firstSeenTick,
      firstMentionByOthersTick: findMention((speakerId) => speakerId !== finderId),
      firstMentionByFinderTick: findMention((speakerId) => speakerId === finderId),
    };
  });
}

export interface ReasonCount {
  reason: string;
  count: number;
}

/** The commonest reasons acts failed, names and numbers grouped. */
export function summarizeFailures(records: SaveRecords): ReasonCount[] {
  const group = buildNameGrouper(Object.values(records.agentNames));
  const counts = new Map<string, number>();
  for (const failure of records.failures) {
    const reason = group(failure.reason);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((first, second) => second.count - first.count)
    .slice(0, config.measure.topReasonCount);
}

export interface MergedRepeatSummary {
  merged: number;
  largestCount: number;
  largest: StreamLine[];
}

/** Stream entries that merged repeats, as any prompt showed them, the largest first. */
export function summarizeMergedRepeats(records: SaveRecords): MergedRepeatSummary {
  const merged = records.streamLines
    .filter((line) => line.count > 1)
    .sort((first, second) => second.count - first.count);
  return {
    merged: merged.length,
    largestCount: merged[0]?.count ?? 0,
    largest: merged.slice(0, config.measure.topReasonCount),
  };
}
