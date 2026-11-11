import { useMemo } from "react";
import { formatSimTime, type Agent, type AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import {
  ACTIVITY_FILTERS,
  buildAgentActivity,
  readLatestThought,
  type ActivityAction,
  type ActivityFilter,
  type ActivitySpeech,
  type ActivityThought,
} from "../format/agent-activity";
import { formatClockTime } from "../format/character-sheet";
import { CATEGORY_GLYPHS } from "../format/event-feed";
import { parseStoredChoice } from "../format/stored-preferences";
import { summarizeLlmCall } from "../format/thoughts";
import { usePanelContext } from "./panel-context";
import { useStoredState } from "./use-stored-state";
import { AgentName, EmptyNote } from "./widgets";

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "everything",
  thoughts: "thoughts",
  reflections: "reflections",
  doings: "doings & words",
};

const THOUGHT_LABELS: Record<ActivityThought["thoughtKind"], string> = {
  decision: "thought",
  interact: "thought, while busy",
  morning: "morning",
  night: "night reflection",
  weekly: "weekly reflection",
  latest: "thought",
};

const parseActivityFilter = (raw: string | null) => parseStoredChoice(raw, ACTIVITY_FILTERS);

function ThoughtItem({ item }: { item: ActivityThought }) {
  return (
    <div className={`activity-thought thought-kind-${item.thoughtKind}`}>
      <span className="activity-label">{THOUGHT_LABELS[item.thoughtKind]}</span>
      {item.error && <p className="error-text">{item.error}</p>}
      {item.headline && <p className="activity-thought-text">{item.headline}</p>}
      {item.parts.length > 0 && (
        <dl className="activity-thought-parts">
          {item.parts.map((thoughtPart, partIndex) => (
            <div key={partIndex}>
              <dt>{thoughtPart.label}</dt>
              <dd>{thoughtPart.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ActionItem({ item }: { item: ActivityAction }) {
  return (
    <div className={`activity-action category-${item.category} feed-${item.eventKind}`}>
      <span className="feed-glyph">{CATEGORY_GLYPHS[item.category]}</span>
      <span>
        {item.text}
        {item.category !== "movement" && <span className="feed-place"> · {item.place}</span>}
      </span>
    </div>
  );
}

function SpeechItem({ item }: { item: ActivitySpeech }) {
  return (
    <div className={`activity-speech volume-${item.volume}`}>
      {item.replyTo && (
        <p className="activity-reply-to">
          <AgentName agentId={item.replyTo.speakerId} name={item.replyTo.speakerName} />:{" "}
          <span className="muted">{item.replyTo.words}</span>
        </p>
      )}
      <p className="activity-said">
        {item.volume !== "normal" && <span className="line-volume">{item.volume}s</span>}
        <span className="line-words">“{item.words}”</span>
        <span className="feed-place"> · {item.place}</span>
      </p>
    </div>
  );
}

/** Everything the agent thought, did and said, newest first, so the sheet answers "why?". */
export function ActivityTab({
  agent,
  detail,
}: {
  agent: Agent;
  detail: AgentDetailMessage | null;
}) {
  const { state, threads } = usePanelContext();
  const [filter, setFilter] = useStoredState<ActivityFilter>(
    clientConfig.storageKeys.activityFilter,
    "all",
    parseActivityFilter,
  );
  const groups = useMemo(
    () =>
      buildAgentActivity(
        {
          agentId: agent.id,
          events: state.events,
          threads,
          thoughts: detail ? detail.llmCalls.map(summarizeLlmCall) : [],
          latestThought: readLatestThought(agent),
        },
        filter,
      ),
    [agent, state.events, threads, detail, filter],
  );

  return (
    <div className="activity">
      <div className="chip-row">
        {ACTIVITY_FILTERS.map((option) => (
          <button
            key={option}
            className={option === filter ? "chip is-active" : "chip"}
            onClick={() => setFilter(option)}
          >
            {FILTER_LABELS[option]}
          </button>
        ))}
      </div>
      {!detail && <p className="muted small-note">Loading {agent.name}'s thoughts…</p>}
      {groups.length === 0 && <EmptyNote>Nothing to show yet.</EmptyNote>}
      <ol className="activity-list">
        {groups.map((group) => (
          <li key={group.tick} className="activity-group">
            <span className="line-time" title={formatSimTime(group.tick, state.timeSettings)}>
              {formatClockTime(group.tick, state.timeSettings)}
            </span>
            <div className="activity-items">
              {group.items.map((item) => {
                if (item.kind === "thought") return <ThoughtItem key={item.key} item={item} />;
                if (item.kind === "action") return <ActionItem key={item.key} item={item} />;
                return <SpeechItem key={item.key} item={item} />;
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
