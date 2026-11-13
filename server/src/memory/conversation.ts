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

function isSaidOrHeardClearlyBy(line: SpokenLine, agentId: string): boolean {
  return line.speakerId === agentId || line.clearListenerIds.includes(agentId);
}

/**
 * The agent's current conversation as raw lines: walking back from the newest line it said or
 * heard clearly until a quiet gap of `endAfterQuietTicks` (the gap that also ends a conversation
 * for summaries), so a long exchange stays in view however long it runs. A time window alone
 * dropped answers from conversations that kept going, and agents asked the same thing again.
 */
function selectConversationLines(
  log: ConversationLog,
  agentId: string,
  tick: number,
): SpokenLine[] {
  const heardLines = log.lines.filter(
    (line) => line.tick <= tick && isSaidOrHeardClearlyBy(line, agentId),
  );
  const newestLine = heardLines[heardLines.length - 1];
  if (newestLine === undefined) return [];
  if (tick - newestLine.tick > config.decision.conversationLingerTicks) return [];
  const { endAfterQuietTicks } = config.memory.conversationSummary;
  let startIndex = heardLines.length - 1;
  while (startIndex > 0) {
    const earlierLine = heardLines[startIndex - 1];
    const laterLine = heardLines[startIndex];
    if (earlierLine === undefined || laterLine === undefined) break;
    if (laterLine.tick - earlierLine.tick >= endAfterQuietTicks) break;
    startIndex -= 1;
  }
  return heardLines.slice(startIndex).slice(-config.decision.conversationLines);
}

/** The last `conversationLines` lines of the conversation the agent is in, its own as "You". */
export function currentConversation(
  log: ConversationLog,
  agentId: string,
  tick: number,
): ConversationLineView[] {
  return selectConversationLines(log, agentId, tick).map((line) => ({
    speakerName: line.speakerId === agentId ? OWN_SPEAKER_NAME : line.speakerName,
    words: line.words,
    tick: line.tick,
  }));
}

/** Keeps lines still needed for participation or for anyone's current conversation. */
export function pruneConversationLog(log: ConversationLog, tick: number): ConversationLog {
  const agentIds = new Set(log.lines.flatMap((line) => [line.speakerId, ...line.clearListenerIds]));
  const linesInView = new Set(
    [...agentIds].flatMap((agentId) => selectConversationLines(log, agentId, tick)),
  );
  return {
    lines: log.lines.filter(
      (line) =>
        linesInView.has(line) ||
        isWithinTicks(line.tick, tick, config.memory.participationWindowTicks),
    ),
  };
}
