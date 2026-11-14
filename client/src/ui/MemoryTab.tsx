import { formatSimTime, type AgentDetailMessage, type StreamEntry } from "@village/shared";
import { usePanelContext } from "./panel-context";
import { EmptyNote } from "./widgets";

function StreamRow({ entry }: { entry: StreamEntry }) {
  const { state } = usePanelContext();
  const startTime = formatSimTime(entry.tick, state.timeSettings);
  return (
    <li className="memory-row">
      <div className="memory-main">
        <div className="memory-text">
          {entry.text}
          {entry.count !== undefined && <span className="muted"> ×{entry.count}</span>}
        </div>
        <div className="memory-sub">
          <span title={`tick ${entry.tick}`}>{startTime}</span>
          {entry.endTick !== undefined && (
            <span title={`tick ${entry.endTick}`}>
              to {formatSimTime(entry.endTick, state.timeSettings)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** Everything the agent remembers: its stream, newest first. */
export function MemoryTab({ detail }: { detail: AgentDetailMessage }) {
  const { stream } = detail.memory;
  if (stream.length === 0) return <EmptyNote>Nothing has happened to them yet.</EmptyNote>;
  return (
    <div className="memory-tab">
      <ul className="memory-list">
        {[...stream].reverse().map((entry) => (
          <StreamRow key={`${entry.tick}-${entry.text}`} entry={entry} />
        ))}
      </ul>
    </div>
  );
}
