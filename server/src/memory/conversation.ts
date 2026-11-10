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

/** A line in an agent's "current conversation"; the agent's own lines are spoken by "You". */
export interface ConversationLineView {
  speakerName: string;
  words: string;
  tick: number;
}

export const OWN_SPEAKER_NAME = "You";

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

/** Up to `conversationLines` lines the agent said or heard clearly within the conversation window. */
export function currentConversation(
  log: ConversationLog,
  agentId: string,
  tick: number,
): ConversationLineView[] {
  return log.lines
    .filter(
      (line) =>
        (line.speakerId === agentId || line.clearListenerIds.includes(agentId)) &&
        isWithinTicks(line.tick, tick, config.decision.conversationWindowTicks),
    )
    .slice(-config.decision.conversationLines)
    .map((line) => ({
      speakerName: line.speakerId === agentId ? OWN_SPEAKER_NAME : line.speakerName,
      words: line.words,
      tick: line.tick,
    }));
}

/** Drops lines too old to matter for participation or the current conversation. */
export function pruneConversationLog(log: ConversationLog, tick: number): ConversationLog {
  const keepTicks = Math.max(
    config.memory.participationWindowTicks,
    config.decision.conversationWindowTicks,
  );
  return { lines: log.lines.filter((line) => tick - line.tick <= keepTicks) };
}
