import type { Moment, WorldEvent } from "@village/shared";
import { toSpokenLine, toStageDirection, type ThreadEntry } from "./conversations";
import { categorizeEvent, type EventCategory } from "./event-feed";
import { isStoryMoment } from "./moments";

export interface StoryFilter {
  agentId: string | null;
  place: string | null;
  /** Speech toggles the place chats; the rest toggle actions, in the chats and in the log. */
  categories: ReadonlySet<EventCategory>;
  /** Big beats in the villagers' inner lives; off unless the reader asks for them. */
  isShowingMoments: boolean;
}

/** Everything said at one place, with the shown actions taken there, oldest first. */
export interface PlaceChat {
  place: string;
  entries: ThreadEntry[];
  /** Everyone who has spoken here. */
  speakerIds: string[];
  /** Who spoke in the latest conversation here, in the order they first spoke. */
  recentSpeakerIds: string[];
  recentSpeakerNames: string[];
  lastSpokenTick: number;
  isLive: boolean;
}

export type StoryLogItem =
  { kind: "event"; event: WorldEvent } | { kind: "moment"; moment: Moment };

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

function startChat(place: string): PlaceChat {
  return {
    place,
    entries: [],
    speakerIds: [],
    recentSpeakerIds: [],
    recentSpeakerNames: [],
    lastSpokenTick: -Infinity,
    isLive: false,
  };
}

function addSpeech(
  chat: PlaceChat,
  event: WorldEvent,
  speech: NonNullable<WorldEvent["speech"]>,
  maxGapTicks: number,
): PlaceChat {
  const isNewConversation = event.tick - chat.lastSpokenTick > maxGapTicks;
  const recentSpeakerIds = isNewConversation ? [] : chat.recentSpeakerIds;
  const recentSpeakerNames = isNewConversation ? [] : chat.recentSpeakerNames;
  const isNewRecentSpeaker = !recentSpeakerIds.includes(event.actorId);
  return {
    ...chat,
    entries: [...chat.entries, toSpokenLine(event, speech)],
    speakerIds: chat.speakerIds.includes(event.actorId)
      ? chat.speakerIds
      : [...chat.speakerIds, event.actorId],
    recentSpeakerIds: isNewRecentSpeaker ? [...recentSpeakerIds, event.actorId] : recentSpeakerIds,
    recentSpeakerNames: isNewRecentSpeaker
      ? [...recentSpeakerNames, event.actorName]
      : recentSpeakerNames,
    lastSpokenTick: event.tick,
  };
}

function compareChats(first: PlaceChat, second: PlaceChat): number {
  if (first.isLive !== second.isLive) return first.isLive ? -1 : 1;
  return first.place.localeCompare(second.place);
}

/**
 * One chat per place where someone has spoken, holding its talk and the shown actions taken there.
 * Live chats come first; within live and quiet, places keep a fixed alphabetical order so new
 * lines never move a chat.
 */
export function buildPlaceChats(
  events: WorldEvent[],
  filter: StoryFilter,
  currentTick: number,
  maxGapTicks: number,
): PlaceChat[] {
  if (!filter.categories.has("speech")) return [];
  const chatsByPlace = new Map<string, PlaceChat>();
  for (const event of events) {
    if (filter.place !== null && event.place !== filter.place) continue;
    const chat = chatsByPlace.get(event.place) ?? startChat(event.place);
    if (event.speech !== undefined) {
      chatsByPlace.set(event.place, addSpeech(chat, event, event.speech, maxGapTicks));
    } else if (filter.categories.has(categorizeEvent(event))) {
      chatsByPlace.set(event.place, {
        ...chat,
        entries: [...chat.entries, toStageDirection(event)],
      });
    }
  }
  return [...chatsByPlace.values()]
    .filter((chat) => chat.speakerIds.length > 0)
    .filter((chat) => filter.agentId === null || chat.speakerIds.includes(filter.agentId))
    .map((chat) => ({ ...chat, isLive: currentTick - chat.lastSpokenTick <= maxGapTicks }))
    .sort(compareChats);
}

function itemTick(item: StoryLogItem): number {
  return item.kind === "event" ? item.event.tick : item.moment.tick;
}

function itemId(item: StoryLogItem): number {
  return item.kind === "event" ? item.event.id : item.moment.id;
}

/** Every shown action in the village, and moments when they are on, newest first. */
export function buildStoryLog(
  events: WorldEvent[],
  filter: StoryFilter,
  moments: Moment[] = [],
): StoryLogItem[] {
  const items: StoryLogItem[] = [
    ...events
      .filter((event) => event.speech === undefined && isEventShown(event, filter))
      .map((event): StoryLogItem => ({ kind: "event", event })),
    ...moments
      .filter((moment) => isMomentShown(moment, filter))
      .map((moment): StoryLogItem => ({ kind: "moment", moment })),
  ];
  return items.sort(
    (first, second) => itemTick(second) - itemTick(first) || itemId(second) - itemId(first),
  );
}
