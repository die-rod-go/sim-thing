import { useMemo } from "react";
import { formatSimTime, type Agent, type AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import {
  ACTIVITY_FILTERS,
  buildAgentActivity,
  type ActivityFilter,
} from "../format/agent-activity";
import { formatClockTime } from "../format/character-sheet";
import { parseStoredChoice } from "../format/stored-preferences";
import { summarizeLlmCall } from "../format/thoughts";
import { usePanelContext } from "./panel-context";
import { useStoredState } from "./use-stored-state";
import { ActivityItemView, type PromptLink } from "./ActivityItems";
import { EmptyNote } from "./widgets";

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "everything",
  thoughts: "thoughts",
  doings: "doings & words",
};

const parseActivityFilter = (raw: string | null) => parseStoredChoice(raw, ACTIVITY_FILTERS);

/** Everything the agent thought, did and said, newest first, so the sheet answers "why?". */
export function ActivityTab({
  agent,
  detail,
  onViewPrompt,
}: {
  agent: Agent;
  detail: AgentDetailMessage | null;
  onViewPrompt: (callId: number) => void;
}) {
  const { state, threads } = usePanelContext();
  const promptLink = useMemo<PromptLink>(
    () => ({
      loadedCallIds: new Set(detail ? detail.llmCalls.map((call) => call.id) : []),
      viewPrompt: onViewPrompt,
    }),
    [detail, onViewPrompt],
  );
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
          latestThought: agent.lastThought,
          moments: state.moments,
        },
        filter,
      ),
    [agent, state.events, state.moments, threads, detail, filter],
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
              {group.items.map((item) => (
                <ActivityItemView key={item.key} item={item} link={promptLink} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
