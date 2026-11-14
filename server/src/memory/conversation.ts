import type { Volume } from "@village/shared";
import { config } from "../config";
import type { PerceivedEvent } from "../perception/types";

/** One `said` event and who took it in. */
export interface SpokenLine {
  speakerId: string;
  speakerName: string;
  tick: number;
  words: string;
  volume: Volume;
  clearListenerIds: string[];
  muffledListenerIds: string[];
}

/** Recent speech, oldest first. Kept small by `pruneConversationLog`. */
export interface ConversationLog {
  lines: SpokenLine[];
}

export function createConversationLog(): ConversationLog {
  return { lines: [] };
}

/** Adds a `said` event to the log; any other event leaves the log unchanged. */
export function recordSpeech(log: ConversationLog, perceived: PerceivedEvent): ConversationLog {
  const { event, perceptions } = perceived;
  if (event.kind !== "said" || event.speech === undefined) return log;
  const listeners = perceptions.filter((perception) => perception.agentId !== event.actorId);
  const line: SpokenLine = {
    speakerId: event.actorId,
    speakerName: event.actorName,
    tick: event.tick,
    words: event.speech.words,
    volume: event.speech.volume,
    clearListenerIds: listeners
      .filter((perception) => perception.hearing === "clear")
      .map((perception) => perception.agentId),
    muffledListenerIds: listeners
      .filter((perception) => perception.hearing === "muffled")
      .map((perception) => perception.agentId),
  };
  return { lines: [...log.lines, line] };
}

function isWithinTicks(lineTick: number, tick: number, windowTicks: number): boolean {
  return lineTick <= tick && tick - lineTick <= windowTicks;
}

/**
 * An agent takes part in a conversation with a speaker if the agent has spoken within the
 * speaker's earshot (the speaker heard it clearly) in the last `participationWindowTicks`.
 */
export function isTakingPart(
  log: ConversationLog,
  agentId: string,
  speakerId: string,
  tick: number,
): boolean {
  if (agentId === speakerId) return true;
  return log.lines.some(
    (line) =>
      line.speakerId === agentId &&
      line.clearListenerIds.includes(speakerId) &&
      isWithinTicks(line.tick, tick, config.memory.participationWindowTicks),
  );
}

/** Keeps only the lines that can still decide who is taking part. */
export function pruneConversationLog(log: ConversationLog, tick: number): ConversationLog {
  return {
    lines: log.lines.filter((line) =>
      isWithinTicks(line.tick, tick, config.memory.participationWindowTicks),
    ),
  };
}
