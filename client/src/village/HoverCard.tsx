import {
  NEED_NAMES,
  type Agent,
  type ConditionDefinition,
  type SimTimeSettings,
} from "@village/shared";
import { describeActivity, describeDeath, describeNeed } from "../format/character-sheet";
import { listVisibleConditions } from "../format/conditions";

const PERCENT = 100;

interface HoverCardProps {
  agent: Agent | null;
  conditionDefinitions: readonly ConditionDefinition[];
  color: string;
  timeSettings: SimTimeSettings;
  cardRef: (element: HTMLElement | null) => void;
}

function NeedBars({ agent }: { agent: Agent }) {
  return (
    <div className="hover-card-needs">
      {NEED_NAMES.map((needName) => {
        const level = describeNeed(needName, agent.needs[needName]);
        return (
          <div key={needName} className="hover-card-need" title={`${needName}: ${level.word}`}>
            <span className="hover-card-need-name">{needName}</span>
            <span className="hover-card-need-track">
              <span
                className={`hover-card-need-fill level-${level.levelIndex}`}
                style={{ width: `${agent.needs[needName] * PERCENT}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A quick look at the agent under the pointer; the frame loop places it beside the figure. */
export function HoverCard({
  agent,
  conditionDefinitions,
  color,
  timeSettings,
  cardRef,
}: HoverCardProps) {
  if (!agent) return null;
  const visibleConditions = listVisibleConditions(agent.conditions, conditionDefinitions);
  return (
    <div className="agent-hover-card" ref={cardRef} style={{ borderTopColor: color }}>
      <div className="hover-card-title">
        <strong>{agent.name}</strong>
        <span className="hover-card-profession">{agent.profession}</span>
      </div>
      {agent.death !== null ? (
        <div className="hover-card-status">{describeDeath(agent.death, timeSettings)}</div>
      ) : (
        <>
          <div className="hover-card-status">
            {describeActivity(agent.currentAction, timeSettings)} · feeling <em>{agent.mood}</em>
          </div>
          {agent.intention && <div className="hover-card-intention">→ {agent.intention}</div>}
          <NeedBars agent={agent} />
        </>
      )}
      {visibleConditions.length > 0 && (
        <div className="hover-card-conditions">
          {visibleConditions.map((condition) => condition.words).join(", ")}
        </div>
      )}
      {agent.lastThought && <div className="hover-card-thought">“{agent.lastThought.text}”</div>}
    </div>
  );
}
