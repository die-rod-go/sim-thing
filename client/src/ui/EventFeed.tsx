import { useMemo, useState } from "react";
import type { WorldEvent } from "@village/shared";
import { formatClockTime } from "../format/character-sheet";
import {
  categorizeEvent,
  EVENT_CATEGORIES,
  filterEvents,
  groupEventsByHour,
  listEventPlaces,
  type EventCategory,
} from "../format/event-feed";
import { usePanelContext } from "./panel-context";
import { AgentName, EmptyNote } from "./widgets";

const ALL = "";

const CATEGORY_GLYPHS: Record<EventCategory, string> = {
  speech: "“",
  action: "⚒",
  exchange: "⇄",
  movement: "→",
  sleep: "☾",
};

/** Movement is the bulk of the log and rarely what you are looking for, so it starts hidden. */
const DEFAULT_CATEGORIES: ReadonlySet<EventCategory> = new Set(
  EVENT_CATEGORIES.filter((category) => category !== "movement"),
);

function toggleCategory(
  categories: ReadonlySet<EventCategory>,
  category: EventCategory,
): ReadonlySet<EventCategory> {
  const next = new Set(categories);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

function EventLine({ worldEvent }: { worldEvent: WorldEvent }) {
  const { state } = usePanelContext();
  const category = categorizeEvent(worldEvent);
  return (
    <li className={`feed-item feed-${worldEvent.kind} category-${category}`}>
      <span className="line-time">{formatClockTime(worldEvent.tick, state.timeSettings)}</span>
      <span className="feed-glyph" title={category}>
        {CATEGORY_GLYPHS[category]}
      </span>
      <span className="feed-text">
        <AgentName agentId={worldEvent.actorId} name={worldEvent.actorName} />{" "}
        {worldEvent.description}
        <span className="feed-place"> · {worldEvent.place}</span>
      </span>
    </li>
  );
}

export function EventFeed() {
  const { state } = usePanelContext();
  const [agentFilter, setAgentFilter] = useState(ALL);
  const [placeFilter, setPlaceFilter] = useState(ALL);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const places = useMemo(() => listEventPlaces(state.events), [state.events]);
  const hourGroups = useMemo(
    () =>
      groupEventsByHour(
        filterEvents(state.events, {
          agentId: agentFilter === ALL ? null : agentFilter,
          place: placeFilter === ALL ? null : placeFilter,
          categories,
        }),
        state.timeSettings,
      ),
    [state.events, state.timeSettings, agentFilter, placeFilter, categories],
  );

  return (
    <div className="event-feed">
      <div className="feed-filters">
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
          <option value={ALL}>All agents</option>
          {state.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <select value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)}>
          <option value={ALL}>All places</option>
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
            className={categories.has(category) ? "chip is-active" : "chip"}
            onClick={() => setCategories(toggleCategory(categories, category))}
          >
            {CATEGORY_GLYPHS[category]} {category}
          </button>
        ))}
      </div>
      {hourGroups.length === 0 && <EmptyNote>No events match.</EmptyNote>}
      {hourGroups.map((group) => (
        <section key={`${group.label}-${group.events[0]?.id ?? 0}`} className="feed-hour">
          <h4 className="feed-hour-label">{group.label}</h4>
          <ol className="feed-list">
            {group.events.map((worldEvent) => (
              <EventLine key={worldEvent.id} worldEvent={worldEvent} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
