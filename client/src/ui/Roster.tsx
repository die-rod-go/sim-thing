import { NEED_NAMES, type Agent } from "@village/shared";
import { describeActivity, describeNeed } from "../format/character-sheet";
import { usePanelContext } from "./panel-context";
import { ColorDot } from "./widgets";

function NeedAlerts({ agent }: { agent: Agent }) {
  const alerts = NEED_NAMES.map((needName) => describeNeed(needName, agent.needs[needName])).filter(
    (level) => level.isAlert,
  );
  return (
    <>
      {alerts.map((level) => (
        <span key={level.word} className={`roster-alert level-${level.levelIndex}`}>
          {level.word}
        </span>
      ))}
    </>
  );
}

/** Everyone at a glance: who they are, what they are doing, and any urgent need. */
export function Roster() {
  const { state, selectAgent } = usePanelContext();
  if (state.agents.length === 0) return <div className="roster muted">No agents yet</div>;
  return (
    <div className="roster">
      {state.agents.map((agent) => {
        const isSelected = agent.id === state.inspectedAgentId;
        return (
          <button
            key={agent.id}
            className={isSelected ? "roster-row is-active" : "roster-row"}
            onClick={() => selectAgent(isSelected ? null : agent.id)}
          >
            <ColorDot agentId={agent.id} />
            <span className="roster-name">{agent.name}</span>
            <span className="roster-activity">
              {describeActivity(agent.currentAction, state.timeSettings)}
              <span className="muted"> · {agent.place}</span>
            </span>
            <span className="roster-alerts">
              <NeedAlerts agent={agent} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
