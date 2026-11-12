import {
  NEED_NAMES,
  listComponentWords,
  readAgentHealth,
  resolveBodyComponents,
  type Agent,
} from "@village/shared";
import { describeDeath } from "../format/character-sheet";
import { groupCarriedItems } from "../format/item-data";
import { ItemDataDisclosure } from "./ItemData";
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
  const { catalog } = state;
  const conditionWords = listComponentWords(
    catalog.declarations,
    resolveBodyComponents(catalog, agent),
    false,
  );
  return (
    <PanelSection title="Status">
      <div className="need-grid">
        <HealthRow value={readAgentHealth(catalog, agent)} />
        {NEED_NAMES.map((needName) => (
          <NeedRow key={needName} needName={needName} value={agent.needs[needName]} />
        ))}
      </div>
      {conditionWords.length > 0 && (
        <div className="token-list condition-list">
          {conditionWords.map((words) => (
            <span key={words} className="token condition-chip">
              {words}
            </span>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

export function OverviewTab({ agent }: { agent: Agent }) {
  const { state } = usePanelContext();
  const carrying = groupCarriedItems(agent.id, state.entities, state.catalog);
  return (
    <div className="overview">
      <StatusSection agent={agent} />
      <PanelSection title="Carrying">
        {carrying.length === 0 && <EmptyNote>Nothing.</EmptyNote>}
        <div className="carried-items">
          {carrying.map((group) => (
            <ItemDataDisclosure key={group.key} label={group.label} data={group.data} />
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
      <PanelSection title="Plans">
        {agent.plans.length === 0 && <EmptyNote>No plans.</EmptyNote>}
        {agent.plans.map((plan, planIndex) => (
          <div key={planIndex} className="goal">
            <div className="goal-text">{plan.aim}</div>
            {plan.steps.length > 0 && (
              <ol className="bullet-list">
                {plan.steps.map((step, stepIndex) => (
                  <li key={stepIndex}>{step}</li>
                ))}
              </ol>
            )}
            {plan.keepFrom && <div className="goal-why">kept from {plan.keepFrom}</div>}
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
