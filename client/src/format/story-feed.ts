import type { WorldEvent } from "@village/shared";
import { isThreadOngoing, type ConversationThread } from "./conversations";
import { categorizeEvent, type EventCategory } from "./event-feed";

export interface StoryThreadItem {
  kind: "thread";
  thread: ConversationThread;
  isOngoing: boolean;
}

export interface StoryEventItem {
  kind: "event";
  event: WorldEvent;
}

export type StoryItem = StoryThreadItem | StoryEventItem;

export interface StoryFilter {
  agentId: string | null;
  place: string | null;
  /** Speech toggles conversation threads; the rest toggle loose events. */
  categories: ReadonlySet<EventCategory>;
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

function latestTick(item: StoryItem): number {
  return item.kind === "thread" ? item.thread.endTick : item.event.tick;
}

function latestId(item: StoryItem): number {
  return item.kind === "thread" ? item.thread.id : item.event.id;
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

  const liveThreads = threadItems.filter((item) => item.isOngoing);
  const rest: StoryItem[] = [...threadItems.filter((item) => !item.isOngoing), ...eventItems];
  rest.sort(
    (first, second) => latestTick(second) - latestTick(first) || latestId(second) - latestId(first),
  );
  return [...liveThreads, ...rest];
}

export function countStoryThreads(items: StoryItem[]): number {
  return items.filter((item) => item.kind === "thread").length;
}
