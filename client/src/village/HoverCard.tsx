import {
  NEED_NAMES,
  readAgentHealth,
  type Agent,
  type SimTimeSettings,
  type ThingCatalog,
} from "@village/shared";
import {
  describeActivity,
  describeDeath,
  describeHealth,
  describeNeed,
  type NeedLevel,
} from "../format/character-sheet";
import { listVisibleBodyComponents } from "../format/conditions";

const PERCENT = 100;

interface HoverCardProps {
  agent: Agent | null;
  catalog: ThingCatalog;
  color: string;
  timeSettings: SimTimeSettings;
  cardRef: (element: HTMLElement | null) => void;
}

function StatusBar({ label, level, value }: { label: string; level: NeedLevel; value: number }) {
  const clampedValue = Math.min(Math.max(value, 0), 1);
  return (
    <div className="hover-card-need" title={`${label}: ${level.word}`}>
      <span className="hover-card-need-name">{label}</span>
      <span className="hover-card-need-track">
        <span
          className={`hover-card-need-fill level-${level.levelIndex}`}
          style={{ width: `${clampedValue * PERCENT}%` }}
        />
      </span>
    </div>
  );
}

/** Health first, then needs, matching the Status section of the character sheet. */
function StatusBars({ agent, catalog }: { agent: Agent; catalog: ThingCatalog }) {
  const health = readAgentHealth(catalog, agent);
  return (
    <div className="hover-card-needs">
      <StatusBar label="health" level={describeHealth(health)} value={health} />
      {NEED_NAMES.map((needName) => (
        <StatusBar
          key={needName}
          label={needName}
          level={describeNeed(needName, agent.needs[needName])}
          value={agent.needs[needName]}
        />
      ))}
    </div>
  );
}

/** A quick look at the agent under the pointer; the frame loop places it beside the figure. */
export function HoverCard({ agent, catalog, color, timeSettings, cardRef }: HoverCardProps) {
  if (!agent) return null;
  const visibleComponents = listVisibleBodyComponents(catalog, agent);
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
          <StatusBars agent={agent} catalog={catalog} />
        </>
      )}
      {visibleComponents.length > 0 && (
        <div className="hover-card-conditions">
          {visibleComponents.map((component) => component.words).join(", ")}
        </div>
      )}
      {agent.lastThought && <div className="hover-card-thought">“{agent.lastThought.text}”</div>}
    </div>
  );
}
