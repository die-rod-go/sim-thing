import type { Volume } from "@village/shared";
import type { ConversationThread, StageDirection, ThreadEntry } from "./conversations";

export interface RunLine {
  eventId: number;
  tick: number;
  words: string;
  volume: Volume;
  thought: string | null;
  llmCallId: number | null;
}

/** Consecutive lines by one speaker, shown under a single name like a chat message group. */
export interface SpeakerRun {
  kind: "run";
  key: number;
  speakerId: string;
  speakerName: string;
  lines: RunLine[];
}

/** A quiet stretch between two entries, marked with the time talk or action picked up again. */
export interface TimePause {
  kind: "pause";
  key: number;
  tick: number;
}

export type ThreadBlock = SpeakerRun | StageDirection | TimePause;

/**
 * Groups entries into chat blocks. With `maxGapTicks`, a gap longer than that between two entries
 * becomes a pause, which also starts a new speaker run.
 */
export function mergeSpeakerRuns(entries: ThreadEntry[], maxGapTicks = Infinity): ThreadBlock[] {
  const blocks: ThreadBlock[] = [];
  let previousTick: number | null = null;
  for (const entry of entries) {
    if (previousTick !== null && entry.tick - previousTick > maxGapTicks) {
      blocks.push({ kind: "pause", key: entry.eventId, tick: entry.tick });
    }
    previousTick = entry.tick;
    if (entry.kind === "stage") {
      blocks.push(entry);
      continue;
    }
    const line: RunLine = {
      eventId: entry.eventId,
      tick: entry.tick,
      words: entry.words,
      volume: entry.volume,
      thought: entry.thought,
      llmCallId: entry.llmCallId,
    };
    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "run" && previous.speakerId === entry.speakerId) {
      blocks[blocks.length - 1] = { ...previous, lines: [...previous.lines, line] };
    } else {
      blocks.push({
        kind: "run",
        key: entry.eventId,
        speakerId: entry.speakerId,
        speakerName: entry.speakerName,
        lines: [line],
      });
    }
  }
  return blocks;
}

export interface ThreadPreview {
  speakerName: string;
  words: string;
  lineCount: number;
}

/** The collapsed one-line view of a thread: who opened it, what they said, and how long it ran. */
export function describeThreadPreview(thread: ConversationThread): ThreadPreview {
  const lines = thread.entries.filter((entry) => entry.kind === "line");
  const firstLine = lines[0];
  return {
    speakerName: firstLine?.speakerName ?? "",
    words: firstLine?.words ?? "",
    lineCount: lines.length,
  };
}

export function countThreadLines(thread: ConversationThread): number {
  return thread.entries.filter((entry) => entry.kind === "line").length;
}
