import { useMemo } from "react";
import type { Moment, WorldEvent } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatClockTime } from "../format/character-sheet";
import {
  CATEGORY_GLYPHS,
  categorizeEvent,
  describeEventForViewer,
  EVENT_CATEGORIES,
  listEventPlaces,
  type EventCategory,
} from "../format/event-feed";
import { describeMomentDetail, MOMENT_GLYPHS, MOMENT_LABELS } from "../format/moments";
import { buildPlaceChats, buildStoryLog, type StoryFilter } from "../format/story-feed";
import { parseStoredStoryFilter, serializeStoryFilter } from "../format/stored-preferences";
import { usePanelContext } from "./panel-context";
import { PlaceChatCard } from "./PlaceChatCard";
import { useStoredState } from "./use-stored-state";
import { AgentName, EmptyNote } from "./widgets";

const ALL = "";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  speech: "talk",
  action: "actions",
  exchange: "gifts & notes",
  movement: "movement",
  sleep: "sleep",
};

/** Movement is the bulk of the log and rarely what you are looking for, so it starts hidden. */
const DEFAULT_FILTER: StoryFilter = {
  agentId: null,
  place: null,
  categories: new Set(EVENT_CATEGORIES.filter((category) => category !== "movement")),
  isShowingMoments: false,
};

function toggleCategory(
  categories: ReadonlySet<EventCategory>,
  category: EventCategory,
): ReadonlySet<EventCategory> {
  const next = new Set(categories);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

function StoryEventLine({ worldEvent }: { worldEvent: WorldEvent }) {
  const { state } = usePanelContext();
  const category = categorizeEvent(worldEvent);
  return (
    <div className={`story-event feed-${worldEvent.kind} category-${category}`}>
      <span className="line-time">{formatClockTime(worldEvent.tick, state.timeSettings)}</span>
      <span className="feed-glyph" title={category}>
        {CATEGORY_GLYPHS[category]}
      </span>
      <span className="feed-text">
        <AgentName agentId={worldEvent.actorId} name={worldEvent.actorName} />{" "}
        {describeEventForViewer(worldEvent)}
        <span className="feed-place"> · {worldEvent.place}</span>
      </span>
    </div>
  );
}

function StoryMomentLine({ moment }: { moment: Moment }) {
  const { state } = usePanelContext();
  const detail = describeMomentDetail(moment);
  return (
    <div className={`story-moment moment-${moment.kind}`}>
      <span className="line-time">{formatClockTime(moment.tick, state.timeSettings)}</span>
      <span className="feed-glyph" title={MOMENT_LABELS[moment.kind]}>
        {MOMENT_GLYPHS[moment.kind]}
      </span>
      <span className="feed-text">
        <AgentName agentId={moment.agentId} name={moment.agentName} /> {moment.text}
        {detail && <span className="story-moment-detail muted"> · {detail}</span>}
      </span>
    </div>
  );
}

function StoryFilters({
  filter,
  onChange,
}: {
  filter: StoryFilter;
  onChange: (filter: StoryFilter) => void;
}) {
  const { state } = usePanelContext();
  const places = useMemo(() => listEventPlaces(state.events), [state.events]);
  return (
    <div className="story-filters">
      <div className="feed-filters">
        <select
          aria-label="Filter by agent"
          value={filter.agentId ?? ALL}
          onChange={(event) =>
            onChange({ ...filter, agentId: event.target.value === ALL ? null : event.target.value })
          }
        >
          <option value={ALL}>Everyone</option>
          {state.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by place"
          value={filter.place ?? ALL}
          onChange={(event) =>
            onChange({ ...filter, place: event.target.value === ALL ? null : event.target.value })
          }
        >
          <option value={ALL}>Everywhere</option>
          {places.map((place) => (
            <option key={place} value={place}>
              {place}
            </option>
          ))}
        </select>
      </div>
      <div className="chip-row">
        {EVENT_CATEGORIES.map((category) => (
          <button
            key={category}
            className={filter.categories.has(category) ? "chip is-active" : "chip"}
            onClick={() =>
              onChange({ ...filter, categories: toggleCategory(filter.categories, category) })
            }
          >
            {CATEGORY_GLYPHS[category]} {CATEGORY_LABELS[category]}
          </button>
        ))}
        <button
          className={filter.isShowingMoments ? "chip is-active" : "chip"}
          onClick={() => onChange({ ...filter, isShowingMoments: !filter.isShowingMoments })}
          title="Personality shifts and goals set or dropped"
        >
          ✦ moments
        </button>
      </div>
    </div>
  );
}

/**
 * The village as one story: a chat per place pinned on top (in a fixed place-name order),
 * and below it a log of every action, newest first.
 */
export function StoryFeed() {
  const { state } = usePanelContext();
  const [filter, setFilter] = useStoredState(
    clientConfig.storageKeys.storyFilter,
    DEFAULT_FILTER,
    parseStoredStoryFilter,
    serializeStoryFilter,
  );
  const { maxGapTicks } = clientConfig.conversations;
  const chats = useMemo(
    () => buildPlaceChats(state.events, filter, state.clock.tick, maxGapTicks),
    [state.events, filter, state.clock.tick, maxGapTicks],
  );
  const logItems = useMemo(
    () => buildStoryLog(state.events, filter, state.moments),
    [state.events, state.moments, filter],
  );

  return (
    <div className="story-feed">
      <div className="story-toolbar">
        <StoryFilters filter={filter} onChange={setFilter} />
        <span className="muted story-count">
          {chats.length} {chats.length === 1 ? "place" : "places"} talking · {logItems.length}{" "}
          events
        </span>
      </div>
      {chats.length > 0 && (
        <div className="story-chats">
          {chats.map((chat) => (
            <PlaceChatCard key={chat.place} chat={chat} />
          ))}
        </div>
      )}
      <div className="story-log">
        {logItems.length === 0 && <EmptyNote>No actions that match yet.</EmptyNote>}
        {logItems.map((item) =>
          item.kind === "moment" ? (
            <StoryMomentLine key={`moment-${item.moment.id}`} moment={item.moment} />
          ) : (
            <StoryEventLine key={`event-${item.event.id}`} worldEvent={item.event} />
          ),
        )}
      </div>
    </div>
  );
}
