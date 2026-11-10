import {
  formatSimTime,
  NEED_NAMES,
  TRAIT_NAMES,
  type Agent,
  type AgentDetailMessage,
} from "@village/shared";
import { clientConfig } from "../clientConfig";
import { describeAction } from "../format/formatters";
import type { ClientState } from "../state/clientState";
import { EmptyNote, MeterBar, PanelSection, TraitSlider } from "./widgets";

interface InspectorTabProps {
  agent: Agent;
  detail: AgentDetailMessage | null;
  state: ClientState;
}

function InventoryList({ inventory }: { inventory: Record<string, number> }) {
  const entries = Object.entries(inventory).filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="muted">empty</span>;
  return <span>{entries.map(([item, count]) => `${item} ×${count}`).join(", ")}</span>;
}

function PersonalityHistory({ detail, state }: { detail: AgentDetailMessage; state: ClientState }) {
  const changes = [...detail.personalityHistory]
    .sort((first, second) => second.tick - first.tick)
    .slice(0, clientConfig.ui.maxPersonalityHistoryShown);
  if (changes.length === 0) return <EmptyNote>No personality changes yet.</EmptyNote>;
  return (
    <ul className="plain-list">
      {changes.map((change) => (
        <li key={change.id}>
          <div className="muted">
            {formatSimTime(change.tick, state.timeSettings)} · {change.field}
          </div>
          <div>
            {change.oldValue} → <strong>{change.newValue}</strong>
          </div>
          <div className="muted">{change.reason}</div>
        </li>
      ))}
    </ul>
  );
}

export function InspectorTab({ agent, detail, state }: InspectorTabProps) {
  const { personality } = agent;
  return (
    <div className="inspector">
      <h2>
        {agent.name} <span className="muted">· {agent.profession}</span>
      </h2>
      <dl className="facts">
        <dt>Place</dt>
        <dd>{agent.place}</dd>
        <dt>Action</dt>
        <dd>{describeAction(agent.currentAction)}</dd>
        <dt>Intention</dt>
        <dd>{agent.intention || <span className="muted">none</span>}</dd>
        <dt>Mood</dt>
        <dd>{agent.mood}</dd>
        <dt>Coins</dt>
        <dd>{agent.coins}</dd>
        <dt>Inventory</dt>
        <dd>
          <InventoryList inventory={agent.inventory} />
        </dd>
      </dl>
      <PanelSection title="Needs">
        {NEED_NAMES.map((needName) => (
          <MeterBar key={needName} label={needName} value={agent.needs[needName]} />
        ))}
      </PanelSection>
      <PanelSection title="Traits">
        {TRAIT_NAMES.map((traitName) => (
          <TraitSlider key={traitName} label={traitName} value={personality.traits[traitName]} />
        ))}
      </PanelSection>
      <PanelSection title="Core">
        <p>{personality.core}</p>
      </PanelSection>
      <PanelSection title="Self-image">
        <p>{personality.selfImage}</p>
      </PanelSection>
      <PanelSection title="Goals">
        {agent.goals.length === 0 && <EmptyNote>No goals.</EmptyNote>}
        <ul className="plain-list">
          {agent.goals.map((goal, goalIndex) => (
            <li key={`${goal.kind}-${goalIndex}`}>
              <div>
                <span className={`tag tag-${goal.kind}`}>{goal.kind}</span> {goal.text}
              </div>
              <div className="muted">Why: {goal.why}</div>
              <div className="muted">Progress: {goal.progress}</div>
            </li>
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="Daily plan">
        <p className="pre-wrap">{agent.dailyPlan || <span className="muted">none yet</span>}</p>
      </PanelSection>
      <PanelSection title="Personality history">
        {detail ? (
          <PersonalityHistory detail={detail} state={state} />
        ) : (
          <EmptyNote>Loading…</EmptyNote>
        )}
      </PanelSection>
    </div>
  );
}
