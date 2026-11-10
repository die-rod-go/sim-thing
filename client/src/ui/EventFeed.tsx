import { useMemo, useState } from "react";
import { formatSimTime } from "@village/shared";
import { describeEvent, filterEvents, listEventPlaces } from "../format/event-feed";
import type { ClientState } from "../state/client-state";
import { EmptyNote } from "./widgets";

const ALL = "";

export function EventFeed({ state }: { state: ClientState }) {
  const [agentFilter, setAgentFilter] = useState(ALL);
  const [placeFilter, setPlaceFilter] = useState(ALL);
  const places = useMemo(() => listEventPlaces(state.events), [state.events]);
  const visibleEvents = useMemo(
    () =>
      filterEvents(state.events, {
        agentId: agentFilter === ALL ? null : agentFilter,
        place: placeFilter === ALL ? null : placeFilter,
      }),
    [state.events, agentFilter, placeFilter],
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
        <span className="muted">{visibleEvents.length} events</span>
      </div>
      {visibleEvents.length === 0 && <EmptyNote>No events yet.</EmptyNote>}
      <ol className="feed-list">
        {visibleEvents.map((worldEvent) => (
          <li key={worldEvent.id} className={`feed-item feed-${worldEvent.kind}`}>
            <span className="feed-time mono">
              {formatSimTime(worldEvent.tick, state.timeSettings)}
            </span>
            <span className="feed-place muted">{worldEvent.place}</span>
            <span className="feed-text">{describeEvent(worldEvent)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
