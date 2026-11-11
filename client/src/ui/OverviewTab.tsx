import { NEED_NAMES, type Agent } from "@village/shared";
import { describeCondition, describeDeath, formatCarrying } from "../format/character-sheet";
import { usePanelContext } from "./panel-context";
import { EmptyNote, HealthRow, NeedRow, PanelSection } from "./widgets";

/** Health first, then needs, then conditions; for the dead, when and how they died instead. */
function StatusSection({ agent }: { agent: Agent }) {
  const { state } = usePanelContext();
  if (agent.death !== null) {
    return (
      <PanelSection title="Status">
        <p className="death-note">{describeDeath(agent.death, state.timeSettings)}</p>
      </PanelSection>
    );
  }
  return (
    <PanelSection title="Status">
      <div className="need-grid">
        <HealthRow value={agent.health} />
        {NEED_NAMES.map((needName) => (
          <NeedRow key={needName} needName={needName} value={agent.needs[needName]} />
        ))}
      </div>
      {agent.conditions.length > 0 && (
        <div className="token-list condition-list">
          {agent.conditions.map((condition) => (
            <span key={condition.name} className="token condition-chip">
              {describeCondition(condition, state.clock.tick, state.timeSettings)}
            </span>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

export function OverviewTab({ agent }: { agent: Agent }) {
  return (
    <div className="overview">
      <StatusSection agent={agent} />
      <PanelSection title="Carrying">
        <div className="token-list">
          {formatCarrying(agent.coins, agent.inventory).map((entry) => (
            <span key={entry} className="token">
              {entry}
            </span>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Goals">
        {agent.goals.length === 0 && <EmptyNote>No goals.</EmptyNote>}
        {agent.goals.map((goal, goalIndex) => (
          <div key={`${goal.kind}-${goalIndex}`} className={`goal goal-${goal.kind}`}>
            <div className="goal-text">
              <span className={`tag tag-${goal.kind}`}>{goal.kind}</span> {goal.text}
            </div>
            {goal.why && <div className="goal-why">because {goal.why}</div>}
            {goal.progress && <div className="goal-progress">▸ {goal.progress}</div>}
          </div>
        ))}
      </PanelSection>
      <PanelSection title="Today's plan">
        {agent.dailyPlan ? (
          <p className="prose pre-wrap">{agent.dailyPlan}</p>
        ) : (
          <EmptyNote>No plan yet.</EmptyNote>
        )}
      </PanelSection>
      <PanelSection title="On their mind">
        {agent.workingMemory.length === 0 ? (
          <EmptyNote>Nothing in particular.</EmptyNote>
        ) : (
          <ul className="bullet-list">
            {agent.workingMemory.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        )}
      </PanelSection>
    </div>
  );
}
