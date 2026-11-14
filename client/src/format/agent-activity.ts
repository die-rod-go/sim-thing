import type { LlmCallKind, Moment, Volume, WorldEvent } from "@village/shared";
import type { ConversationThread, SpokenLine } from "./conversations";
import { categorizeEvent, describeEventForViewer, type EventCategory } from "./event-feed";
import { collectMoments, foldFailures, pairSpeechWithThoughts } from "./activity-folding";
import type { ThoughtEntry, ThoughtPart } from "./thoughts";

export interface ActivityThought {
  kind: "thought";
  key: string;
  tick: number;
  thoughtKind: LlmCallKind | "latest";
  /** The LLM call this came from; null for the live latest thought. */
  callId: number | null;
  headline: string | null;
  parts: ThoughtPart[];
  error: string | null;
}

export interface ActivityAction {
  kind: "action";
  key: string;
  tick: number;
  category: EventCategory;
  eventKind: WorldEvent["kind"];
  text: string;
  place: string;
}

export interface ContextLine {
  speakerId: string;
  speakerName: string;
  words: string;
}

export interface ActivitySpeech {
  kind: "speech";
  key: string;
  tick: number;
  words: string;
  volume: Volume;
  place: string;
  /** The other speaker's line this one followed, so a reply reads with what it answers. */
  replyTo: ContextLine | null;
  thought: string | null;
  llmCallId: number | null;
  /** The decision that produced this line is already shown just above it in the timeline. */
  isThoughtShownAbove: boolean;
}

export interface ActivityMoment {
  kind: "moment";
  key: string;
  tick: number;
  moment: Moment;
}

/** A run of failed attempts in a row, folded so a stubborn retry loop doesn't flood the sheet. */
export interface ActivityFailures {
  kind: "failures";
  key: string;
  tick: number;
  failures: ActivityAction[];
}

export type ActivityItem =
  ActivityThought | ActivityAction | ActivitySpeech | ActivityMoment | ActivityFailures;

/** Everything that happened to one agent on one tick, in reading order: thought, did, said. */
export interface ActivityGroup {
  tick: number;
  items: ActivityItem[];
}

export type ActivityFilter = "all" | "thoughts" | "doings";

export const ACTIVITY_FILTERS: readonly ActivityFilter[] = ["all", "thoughts", "doings"];

export interface LatestThought {
  text: string;
  tick: number;
}

export interface AgentActivityInput {
  agentId: string;
  /** Oldest first, as kept in client state. */
  events: WorldEvent[];
  threads: ConversationThread[];
  thoughts: ThoughtEntry[];
  latestThought: LatestThought | null;
  /** Every agent's moments; only this agent's are used. */
  moments: Moment[];
}

/** Decision replies also say what was said and done; the events show those, so skip them here. */
const PARTS_SHOWN_AS_EVENTS: ReadonlySet<string> = new Set([
  "said",
  "whispered",
  "shouted",
  "does",
]);

const READING_ORDER: Record<ActivityItem["kind"], number> = {
  thought: 0,
  moment: 1,
  action: 2,
  failures: 2,
  speech: 3,
};

function toThoughtItem(entry: ThoughtEntry): ActivityThought {
  const isDecision = entry.kind === "decision" || entry.kind === "interact";
  return {
    kind: "thought",
    key: `call-${entry.callId}`,
    tick: entry.tick,
    thoughtKind: entry.kind,
    callId: entry.callId,
    headline: entry.headline,
    parts: isDecision
      ? entry.parts.filter((thoughtPart) => !PARTS_SHOWN_AS_EVENTS.has(thoughtPart.label))
      : entry.parts,
    error: entry.error,
  };
}

function describeMovement(event: WorldEvent): string {
  return event.kind === "arrived" ? `walked to ${event.place}` : event.description;
}

/** Walks show once: an arrival replaces the start of the same walk. */
function collectActions(agentId: string, events: WorldEvent[]): ActivityAction[] {
  const actions: ActivityAction[] = [];
  for (const event of events) {
    if (event.speech !== undefined) continue;
    const involvesAgent = event.actorId === agentId || event.targetId === agentId;
    if (!involvesAgent) continue;
    const category = categorizeEvent(event);
    const previous = actions[actions.length - 1];
    const isArrivalAfterStart =
      event.kind === "arrived" &&
      event.actorId === agentId &&
      previous?.eventKind === "walk_started";
    if (isArrivalAfterStart) actions.pop();
    actions.push({
      kind: "action",
      key: `event-${event.id}`,
      tick: event.tick,
      category,
      eventKind: event.kind,
      text: category === "movement" ? describeMovement(event) : describeEventForViewer(event),
      place: event.place,
    });
  }
  return actions;
}

function findReplyContext(lines: SpokenLine[], lineIndex: number): ContextLine | null {
  const current = lines[lineIndex];
  const previous = lines[lineIndex - 1];
  if (!current || !previous || previous.speakerId === current.speakerId) return null;
  return {
    speakerId: previous.speakerId,
    speakerName: previous.speakerName,
    words: previous.words,
  };
}

function collectSpeech(agentId: string, threads: ConversationThread[]): ActivitySpeech[] {
  return threads.flatMap((thread) => {
    const lines = thread.entries.filter((entry): entry is SpokenLine => entry.kind === "line");
    return lines.flatMap((line, lineIndex) =>
      line.speakerId === agentId
        ? [
            {
              kind: "speech" as const,
              key: `event-${line.eventId}`,
              tick: line.tick,
              words: line.words,
              volume: line.volume,
              place: thread.place,
              replyTo: findReplyContext(lines, lineIndex),
              thought: line.thought,
              llmCallId: line.llmCallId,
              isThoughtShownAbove: false,
            },
          ]
        : [],
    );
  });
}

function isShownByFilter(item: ActivityItem, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  return filter === "thoughts" ? item.kind === "thought" : item.kind !== "thought";
}

function groupByTick(items: ActivityItem[]): ActivityGroup[] {
  const groupsByTick = new Map<number, ActivityItem[]>();
  for (const item of items)
    groupsByTick.set(item.tick, [...(groupsByTick.get(item.tick) ?? []), item]);
  return [...groupsByTick]
    .sort(([firstTick], [secondTick]) => secondTick - firstTick)
    .map(([tick, tickItems]) => ({
      tick,
      items: [...tickItems].sort(
        (first, second) => READING_ORDER[first.kind] - READING_ORDER[second.kind],
      ),
    }));
}

function buildLatestThoughtItems(
  latestThought: LatestThought | null,
  thoughtItems: ActivityThought[],
): ActivityThought[] {
  if (latestThought === null) return [];
  const isAlreadyListed = thoughtItems.some(
    (item) => item.tick === latestThought.tick && item.headline === latestThought.text,
  );
  if (isAlreadyListed) return [];
  return [
    {
      kind: "thought",
      key: `latest-${latestThought.tick}`,
      tick: latestThought.tick,
      thoughtKind: "latest",
      callId: null,
      headline: latestThought.text,
      parts: [],
      error: null,
    },
  ];
}

/**
 * One agent's thoughts, doings and words as a single timeline: groups newest first, and inside each
 * tick the thought comes before the act and the act before the words.
 */
export function buildAgentActivity(
  input: AgentActivityInput,
  filter: ActivityFilter = "all",
): ActivityGroup[] {
  const thoughtItems = input.thoughts.map(toThoughtItem);
  const items: ActivityItem[] = [
    ...thoughtItems,
    ...buildLatestThoughtItems(input.latestThought, thoughtItems),
    ...collectMoments(input.agentId, input.moments),
    ...foldFailures(collectActions(input.agentId, input.events)),
    ...pairSpeechWithThoughts(collectSpeech(input.agentId, input.threads), thoughtItems),
  ].filter((item) => isShownByFilter(item, filter));
  return groupByTick(items);
}

/** The newest thought from any source, for the sheet's always-visible "Now" strip. */
export function findNewestThought(
  thoughts: ThoughtEntry[],
  latestThought: LatestThought | null,
): LatestThought | null {
  const newestDecision = thoughts
    .filter((entry) => entry.headline !== null && entry.kind === "decision")
    .sort((first, second) => second.tick - first.tick || second.callId - first.callId)[0];
  const fromCalls =
    newestDecision && newestDecision.headline !== null
      ? { text: newestDecision.headline, tick: newestDecision.tick }
      : null;
  if (latestThought === null) return fromCalls;
  if (fromCalls === null) return latestThought;
  return latestThought.tick >= fromCalls.tick ? latestThought : fromCalls;
}
