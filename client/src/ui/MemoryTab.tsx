import { useMemo, useState } from "react";
import { formatSimTime, type AgentDetailMessage } from "@village/shared";
import { formatMinutesAgo } from "../format/formatters";
import { buildAwarenessRows, countTags, groupMemoriesByBucket } from "../format/memory-view";
import type { ClientState } from "../state/client-state";
import { EmptyNote, PanelSection, StrengthBar } from "./widgets";

const MAX_TAG_CHIPS = 30;

interface MemoryTabProps {
  detail: AgentDetailMessage;
  state: ClientState;
}

function AwarenessTable({ detail, state }: MemoryTabProps) {
  const rows = buildAwarenessRows(
    detail.agent,
    state.agents,
    state.clock.tick,
    state.timeSettings.minutesPerTick,
  );
  if (rows.length === 0) return <EmptyNote>Has not perceived anyone yet.</EmptyNote>;
  return (
    <table className="awareness">
      <thead>
        <tr>
          <th>Who</th>
          <th>Via</th>
          <th>Place</th>
          <th>Doing</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.agentId}>
            <td>{row.name}</td>
            <td>{row.via.replace("_", " ")}</td>
            <td>{row.place}</td>
            <td>{row.doing}</td>
            <td className="nowrap">{formatMinutesAgo(row.minutesAgo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MemoryTab({ detail, state }: MemoryTabProps) {
  const [tagFilter, setTagFilter] = useState("");
  const groups = useMemo(
    () => groupMemoriesByBucket(detail.memories, tagFilter),
    [detail.memories, tagFilter],
  );
  const tagCounts = useMemo(
    () => countTags(detail.memories).slice(0, MAX_TAG_CHIPS),
    [detail.memories],
  );

  return (
    <div className="memory-tab">
      <PanelSection title="Filter by tag">
        <input
          className="text-input"
          placeholder="tag…"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        />
        <div className="tag-cloud">
          {tagCounts.map(({ tag, count }) => (
            <button
              key={tag}
              className={tag === tagFilter ? "tag is-active" : "tag"}
              onClick={() => setTagFilter(tag === tagFilter ? "" : tag)}
            >
              {tag} <span className="muted">{count}</span>
            </button>
          ))}
        </div>
      </PanelSection>
      {groups.map((group) => (
        <PanelSection key={group.bucket} title={`${group.bucket} (${group.memories.length})`}>
          {group.memories.length === 0 && <EmptyNote>nothing</EmptyNote>}
          <ul className="plain-list">
            {group.memories.map((memory) => (
              <li key={memory.id} className="memory">
                <div className="memory-meta">
                  <StrengthBar strength={memory.strength} />
                  <span className="muted">{formatSimTime(memory.tick, state.timeSettings)}</span>
                </div>
                <div>{memory.text}</div>
                <div className="tag-cloud">
                  {memory.tags.map((tag) => (
                    <button key={tag} className="tag tag-small" onClick={() => setTagFilter(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </PanelSection>
      ))}
      <PanelSection title="Awareness">
        <AwarenessTable detail={detail} state={state} />
      </PanelSection>
    </div>
  );
}
