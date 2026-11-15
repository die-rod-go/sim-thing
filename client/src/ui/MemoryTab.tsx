import {
  formatSimTime,
  type AgentDetailMessage,
  type StreamEntry,
  type Summary,
} from "@village/shared";
import { usePanelContext } from "./panel-context";
import { EmptyNote, PanelSection } from "./widgets";

function StreamRow({ entry }: { entry: StreamEntry }) {
  const { state } = usePanelContext();
  return (
    <li className="memory-row">
      <div className="memory-main">
        <div className="memory-text">
          {entry.text}
          {entry.count !== undefined && <span className="muted"> ×{entry.count}</span>}
        </div>
        <div className="memory-sub">
          <span title={`tick ${entry.tick}`}>{formatSimTime(entry.tick, state.timeSettings)}</span>
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

function SummaryRow({ summary }: { summary: Summary }) {
  const { state } = usePanelContext();
  return (
    <li className="memory-row">
      <div className="memory-main">
        <div className="memory-text">{summary.text}</div>
        <div className="memory-sub">
          <span title={`ticks ${summary.startTick} to ${summary.endTick}`}>
            {formatSimTime(summary.startTick, state.timeSettings)} to{" "}
            {formatSimTime(summary.endTick, state.timeSettings)}
          </span>
        </div>
      </div>
    </li>
  );
}

function SummarySection({ title, summaries }: { title: string; summaries: Summary[] }) {
  if (summaries.length === 0) return null;
  return (
    <PanelSection title={title}>
      <ul className="memory-list">
        {[...summaries].reverse().map((summary) => (
          <SummaryRow key={`${summary.startTick}-${summary.endTick}`} summary={summary} />
        ))}
      </ul>
    </PanelSection>
  );
}

/** Everything the agent remembers, newest first: the stream, then ever coarser summaries. */
export function MemoryTab({ detail }: { detail: AgentDetailMessage }) {
  const { stream, episodes, chronicles, daySummary, history } = detail.memory;
  return (
    <div className="memory-tab">
      <PanelSection title="Stream">
        {stream.length === 0 && <EmptyNote>Nothing has happened to them yet.</EmptyNote>}
        <ul className="memory-list">
          {[...stream].reverse().map((entry) => (
            <StreamRow key={`${entry.tick}-${entry.text}`} entry={entry} />
          ))}
        </ul>
      </PanelSection>
      <SummarySection title="Episodes" summaries={episodes} />
      <SummarySection title="Chronicles" summaries={chronicles} />
      <SummarySection title="Day summary" summaries={daySummary === null ? [] : [daySummary]} />
      <SummarySection title="History" summaries={history === null ? [] : [history]} />
    </div>
  );
}
