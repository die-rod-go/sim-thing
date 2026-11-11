import { useMemo, useState } from "react";
import { formatSimTime } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatClockTime } from "../format/character-sheet";
import {
  involvesAgent,
  isThreadOngoing,
  type ConversationThread,
  type ThreadEntry,
} from "../format/conversations";
import { usePanelContext } from "./panel-context";
import { AgentName, ColorDot, EmptyNote } from "./widgets";

const EVERYONE = "";

function ThreadLine({ entry }: { entry: ThreadEntry }) {
  const { state } = usePanelContext();
  const time = <span className="line-time">{formatClockTime(entry.tick, state.timeSettings)}</span>;
  if (entry.kind === "stage") {
    return (
      <li className="thread-stage">
        {time}
        <span>
          <AgentName agentId={entry.actorId} name={entry.actorName} /> {entry.text}
        </span>
      </li>
    );
  }
  return (
    <li className={`thread-line volume-${entry.volume}`}>
      {time}
      <span className="line-speaker">
        <AgentName agentId={entry.speakerId} name={entry.speakerName} />
        {entry.volume !== "normal" && <span className="line-volume">{entry.volume}s</span>}
      </span>
      <span className="line-words">{entry.words}</span>
    </li>
  );
}

function ThreadCard({ thread }: { thread: ConversationThread }) {
  const { state } = usePanelContext();
  const isOngoing = isThreadOngoing(
    thread,
    state.clock.tick,
    clientConfig.conversations.maxGapTicks,
  );
  const lineCount = thread.entries.filter((entry) => entry.kind === "line").length;
  return (
    <article className={isOngoing ? "thread is-ongoing" : "thread"}>
      <header className="thread-header">
        <span className="thread-place">{thread.place}</span>
        <span className="thread-speakers">
          {thread.speakerIds.map((speakerId) => (
            <ColorDot key={speakerId} agentId={speakerId} />
          ))}
          {thread.speakerNames.join(", ")}
        </span>
        <span className="thread-when muted">
          {isOngoing && <span className="live-badge">live</span>}
          {formatSimTime(thread.startTick, state.timeSettings)}
          {thread.endTick !== thread.startTick &&
            `–${formatClockTime(thread.endTick, state.timeSettings)}`}
          {` · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
        </span>
      </header>
      <ol className="thread-lines">
        {thread.entries.map((entry) => (
          <ThreadLine key={entry.eventId} entry={entry} />
        ))}
      </ol>
    </article>
  );
}

/** Speech from the event window as threads, so who said what to whom reads like a transcript. */
export function ConversationsTab() {
  const { state, threads } = usePanelContext();
  const [agentFilter, setAgentFilter] = useState(state.inspectedAgentId ?? EVERYONE);
  const [isMonologueHidden, setIsMonologueHidden] = useState(false);
  const visibleThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          (agentFilter === EVERYONE || involvesAgent(thread, agentFilter)) &&
          (!isMonologueHidden || thread.speakerIds.length > 1),
      ),
    [threads, agentFilter, isMonologueHidden],
  );

  return (
    <div className="conversations">
      <div className="feed-filters">
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
          <option value={EVERYONE}>Everyone</option>
          {state.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <label className="toggle small-toggle">
          <input
            type="checkbox"
            checked={isMonologueHidden}
            onChange={(event) => setIsMonologueHidden(event.target.checked)}
          />
          hide lone speakers
        </label>
        <span className="muted">{visibleThreads.length} conversations</span>
      </div>
      {visibleThreads.length === 0 && <EmptyNote>No one has talked yet.</EmptyNote>}
      {visibleThreads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </div>
  );
}
