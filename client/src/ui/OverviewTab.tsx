import {
  NEED_NAMES,
  buildDefinitionNamer,
  formatSimTime,
  listComponentWords,
  readAgentHealth,
  resolveBodyComponents,
  type Agent,
  type SeenPlace,
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
    buildDefinitionNamer(catalog),
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

function SeenPlaceRow({ seenPlace }: { seenPlace: SeenPlace }) {
  const { state } = usePanelContext();
  const { entities } = seenPlace;
  return (
    <div className="goal">
      <div className="goal-text">{seenPlace.name}</div>
      {entities !== null && (
        <div className="goal-why" title={formatSimTime(entities.tick, state.timeSettings)}>
          {entities.names.length > 0 ? entities.names.join(", ") : "nothing there"}
        </div>
      )}
    </div>
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
      <PanelSection title="Long-term goals">
        {agent.longTermGoals.length === 0 && <EmptyNote>No long-term goals.</EmptyNote>}
        {agent.longTermGoals.map((goal, goalIndex) => (
          <div key={goalIndex} className="goal">
            <div className="goal-text">{goal.goal}</div>
            {goal.reason && <div className="goal-why">because {goal.reason}</div>}
            {goal.progress && <div className="goal-progress">▸ {goal.progress}</div>}
          </div>
        ))}
      </PanelSection>
      <PanelSection title="Short-term goals">
        {agent.shortTermGoals.length === 0 && <EmptyNote>None yet.</EmptyNote>}
        {agent.shortTermGoals.map((goal, goalIndex) => (
          <div key={goalIndex} className="goal">
            <div className="goal-text">{goal.goal}</div>
            {goal.reason && <div className="goal-why">because {goal.reason}</div>}
            {goal.steps.length > 0 && (
              <ol className="bullet-list">
                {goal.steps.map((step, stepIndex) => (
                  <li key={stepIndex}>{step}</li>
                ))}
              </ol>
            )}
            {goal.progress && <div className="goal-progress">▸ {goal.progress}</div>}
          </div>
        ))}
      </PanelSection>
      <PanelSection title="Places seen">
        {agent.seenPlaces.length === 0 && <EmptyNote>None yet.</EmptyNote>}
        {agent.seenPlaces.map((seenPlace) => (
          <SeenPlaceRow key={seenPlace.name} seenPlace={seenPlace} />
        ))}
      </PanelSection>
    </div>
  );
}
