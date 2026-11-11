import type { Volume } from "@village/shared";
import type { ConversationThread, StageDirection, ThreadEntry } from "./conversations";

export interface RunLine {
  eventId: number;
  tick: number;
  words: string;
  volume: Volume;
}

/** Consecutive lines by one speaker, shown under a single name like a chat message group. */
export interface SpeakerRun {
  kind: "run";
  key: number;
  speakerId: string;
  speakerName: string;
  lines: RunLine[];
}

export type ThreadBlock = SpeakerRun | StageDirection;

export function mergeSpeakerRuns(entries: ThreadEntry[]): ThreadBlock[] {
  const blocks: ThreadBlock[] = [];
  for (const entry of entries) {
    if (entry.kind === "stage") {
      blocks.push(entry);
      continue;
    }
    const line: RunLine = {
      eventId: entry.eventId,
      tick: entry.tick,
      words: entry.words,
      volume: entry.volume,
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
