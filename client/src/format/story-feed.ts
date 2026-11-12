import type { Moment, WorldEvent } from "@village/shared";
import { isGiftOrNote, isThreadOngoing, type ConversationThread } from "./conversations";
import { categorizeEvent, type EventCategory } from "./event-feed";
import { isStoryMoment } from "./moments";

export interface StoryThreadItem {
  kind: "thread";
  thread: ConversationThread;
  isOngoing: boolean;
}

export interface StoryEventItem {
  kind: "event";
  event: WorldEvent;
}

export interface StoryMomentItem {
  kind: "moment";
  moment: Moment;
}

export type StoryItem = StoryThreadItem | StoryEventItem | StoryMomentItem;

export interface StoryFilter {
  agentId: string | null;
  place: string | null;
  /** Speech toggles conversation threads; the rest toggle loose events. */
  categories: ReadonlySet<EventCategory>;
  /** Big beats in the villagers' inner lives; off unless the reader asks for them. */
  isShowingMoments: boolean;
  /** Speakers' doings (of the shown categories) appear inside their conversations. */
  isShowingActionsInThreads: boolean;
}

/**
 * Which events fold into a conversation as stage directions: gifts and notes always, and with
 * actions in threads on, anything else of a shown category.
 */
export function pickStageEvents(filter: StoryFilter): (event: WorldEvent) => boolean {
  if (!filter.isShowingActionsInThreads) return isGiftOrNote;
  return (event) => isGiftOrNote(event) || filter.categories.has(categorizeEvent(event));
}

function threadEventIds(threads: ConversationThread[]): Set<number> {
  return new Set(threads.flatMap((thread) => thread.entries.map((entry) => entry.eventId)));
}

function isThreadShown(thread: ConversationThread, filter: StoryFilter): boolean {
  if (!filter.categories.has("speech")) return false;
  if (filter.place !== null && thread.place !== filter.place) return false;
  return filter.agentId === null || thread.speakerIds.includes(filter.agentId);
}

function isEventShown(event: WorldEvent, filter: StoryFilter): boolean {
  if (!filter.categories.has(categorizeEvent(event))) return false;
  if (filter.place !== null && event.place !== filter.place) return false;
  return (
    filter.agentId === null || event.actorId === filter.agentId || event.targetId === filter.agentId
  );
}

function isMomentShown(moment: Moment, filter: StoryFilter): boolean {
  if (!filter.isShowingMoments || !isStoryMoment(moment)) return false;
  if (filter.place !== null) return false;
  return filter.agentId === null || moment.agentId === filter.agentId;
}

function latestTick(item: StoryItem): number {
  if (item.kind === "thread") return item.thread.endTick;
  return item.kind === "event" ? item.event.tick : item.moment.tick;
}

function latestId(item: StoryItem): number {
  if (item.kind === "thread") return item.thread.id;
  return item.kind === "event" ? item.event.id : item.moment.id;
}

/**
 * One timeline of conversations and the events around them: live threads first, then everything
 * else newest first. Events already shown inside a thread are not repeated on their own.
 */
export function buildStory(
  events: WorldEvent[],
  threads: ConversationThread[],
  filter: StoryFilter,
  currentTick: number,
  maxGapTicks: number,
  moments: Moment[] = [],
): StoryItem[] {
  const idsInThreads = threadEventIds(threads);
  const threadItems: StoryThreadItem[] = threads
    .filter((thread) => isThreadShown(thread, filter))
    .map((thread) => ({
      kind: "thread",
      thread,
      isOngoing: isThreadOngoing(thread, currentTick, maxGapTicks),
    }));
  const eventItems: StoryEventItem[] = events
    .filter((event) => event.speech === undefined && !idsInThreads.has(event.id))
    .filter((event) => isEventShown(event, filter))
    .map((event) => ({ kind: "event", event }));

  const momentItems: StoryMomentItem[] = moments
    .filter((moment) => isMomentShown(moment, filter))
    .map((moment) => ({ kind: "moment", moment }));

  const liveThreads = threadItems.filter((item) => item.isOngoing);
  const rest: StoryItem[] = [
    ...threadItems.filter((item) => !item.isOngoing),
    ...eventItems,
    ...momentItems,
  ];
  rest.sort(
    (first, second) => latestTick(second) - latestTick(first) || latestId(second) - latestId(first),
  );
  return [...liveThreads, ...rest];
}

export function countStoryThreads(items: StoryItem[]): number {
  return items.filter((item) => item.kind === "thread").length;
}
