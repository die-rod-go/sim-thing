import type { Volume, WorldEvent } from "@village/shared";

export interface SpokenLine {
  kind: "line";
  eventId: number;
  tick: number;
  speakerId: string;
  speakerName: string;
  words: string;
  volume: Volume;
  /** What the speaker was thinking when it chose to say this, when the server sent it. */
  thought: string | null;
  /** The decision call that produced the line, for linking to the prompt viewer. */
  llmCallId: number | null;
}

/** Something a participant did mid-conversation, such as handing over an item. */
export interface StageDirection {
  kind: "stage";
  eventId: number;
  tick: number;
  actorId: string;
  actorName: string;
  text: string;
}

export type ThreadEntry = SpokenLine | StageDirection;

export interface ConversationThread {
  id: number;
  place: string;
  startTick: number;
  endTick: number;
  /** Speakers in the order they first spoke. */
  speakerIds: string[];
  speakerNames: string[];
  entries: ThreadEntry[];
}

const STAGE_EVENT_KINDS: ReadonlySet<WorldEvent["kind"]> = new Set(["gave", "posted_note"]);

function toSpokenLine(event: WorldEvent, speech: NonNullable<WorldEvent["speech"]>): SpokenLine {
  return {
    kind: "line",
    eventId: event.id,
    tick: event.tick,
    speakerId: event.actorId,
    speakerName: event.actorName,
    words: speech.words,
    volume: speech.volume,
    thought: speech.thought ?? null,
    llmCallId: speech.llmCallId ?? null,
  };
}

function addLine(thread: ConversationThread, line: SpokenLine): ConversationThread {
  const isNewSpeaker = !thread.speakerIds.includes(line.speakerId);
  return {
    ...thread,
    endTick: line.tick,
    speakerIds: isNewSpeaker ? [...thread.speakerIds, line.speakerId] : thread.speakerIds,
    speakerNames: isNewSpeaker ? [...thread.speakerNames, line.speakerName] : thread.speakerNames,
    entries: [...thread.entries, line],
  };
}

function openThread(event: WorldEvent, line: SpokenLine): ConversationThread {
  return {
    id: event.id,
    place: event.place,
    startTick: event.tick,
    endTick: event.tick,
    speakerIds: [line.speakerId],
    speakerNames: [line.speakerName],
    entries: [line],
  };
}

/**
 * Groups speech into threads for display: lines at the same place join the latest thread there
 * unless the previous line was more than `maxGapTicks` earlier. Gifts and notes by a speaker
 * during a thread show inline. Input is oldest first; threads come back newest first.
 */
export function groupConversations(
  events: WorldEvent[],
  maxGapTicks: number,
): ConversationThread[] {
  const threads: ConversationThread[] = [];
  const openThreadIndexByPlace = new Map<string, number>();

  for (const event of events) {
    const openIndex = openThreadIndexByPlace.get(event.place);
    const openThreadAtPlace = openIndex === undefined ? undefined : threads[openIndex];
    const isThreadOpen =
      openThreadAtPlace !== undefined && event.tick - openThreadAtPlace.endTick <= maxGapTicks;

    if (event.speech !== undefined) {
      const line = toSpokenLine(event, event.speech);
      if (isThreadOpen && openIndex !== undefined) {
        threads[openIndex] = addLine(openThreadAtPlace, line);
      } else {
        openThreadIndexByPlace.set(event.place, threads.length);
        threads.push(openThread(event, line));
      }
      continue;
    }

    const isParticipantAction =
      isThreadOpen &&
      STAGE_EVENT_KINDS.has(event.kind) &&
      openThreadAtPlace.speakerIds.includes(event.actorId);
    if (isParticipantAction && openIndex !== undefined) {
      const direction: StageDirection = {
        kind: "stage",
        eventId: event.id,
        tick: event.tick,
        actorId: event.actorId,
        actorName: event.actorName,
        text: event.description,
      };
      threads[openIndex] = {
        ...openThreadAtPlace,
        entries: [...openThreadAtPlace.entries, direction],
      };
    }
  }

  return threads.reverse();
}

export function isThreadOngoing(
  thread: ConversationThread,
  currentTick: number,
  maxGapTicks: number,
): boolean {
  return currentTick - thread.endTick <= maxGapTicks;
}

export function involvesAgent(thread: ConversationThread, agentId: string): boolean {
  return thread.speakerIds.includes(agentId);
}
