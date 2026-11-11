import { NEED_NAMES, type Agent } from "@village/shared";
import { clientConfig } from "../client-config";
import { describeActivity, describeHealth, describeNeed } from "../format/character-sheet";
import { usePanelContext } from "./panel-context";
import { ColorDot } from "./widgets";

const PERCENT = 100;

function MiniNeedBars({ agent }: { agent: Agent }) {
  return (
    <span className="mini-needs">
      {NEED_NAMES.map((needName) => {
        const value = Math.min(Math.max(agent.needs[needName], 0), 1);
        const level = describeNeed(needName, value);
        return (
          <span
            key={needName}
            className={`mini-need level-${level.levelIndex}`}
            title={`${needName}: ${level.word}`}
          >
            <span className="mini-need-fill" style={{ height: `${value * PERCENT}%` }} />
          </span>
        );
      })}
    </span>
  );
}

function RosterCard({ agent, isSelected }: { agent: Agent; isSelected: boolean }) {
  const { state, selectAgent, highlightAgents } = usePanelContext();
  const isDead = agent.death !== null;
  const hasAlert =
    !isDead &&
    (describeHealth(agent.health).isAlert ||
      NEED_NAMES.some((needName) => describeNeed(needName, agent.needs[needName]).isAlert));
  const classNames = [
    "roster-card",
    isSelected && "is-active",
    hasAlert && "has-alert",
    isDead && "is-dead",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={classNames}
      onClick={() => selectAgent(isSelected ? null : agent.id)}
      onPointerEnter={() => highlightAgents([agent.id])}
      onPointerLeave={() => highlightAgents([])}
      title={`${agent.name}, ${agent.profession}`}
    >
      <span className="roster-card-top">
        <ColorDot agentId={agent.id} />
        <span className="roster-name">{agent.name}</span>
        {!isDead && <MiniNeedBars agent={agent} />}
      </span>
      <span className="roster-activity">
        {isDead ? "dead" : describeActivity(agent.currentAction, state.timeSettings)}
        <span className="muted"> · {agent.place}</span>
      </span>
      <span className="roster-mood">{agent.mood}</span>
    </button>
  );
}

/** Everyone at a glance, always beside the map; collapses to a column of colored dots. */
export function RosterRail({
  isCollapsed,
  onCollapsedChange,
}: {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
}) {
  const { state, selectAgent } = usePanelContext();
  const { rosterRailWidthPx, collapsedRailWidthPx } = clientConfig.shell;
  return (
    <nav
      className={isCollapsed ? "roster-rail is-collapsed" : "roster-rail"}
      style={{ width: isCollapsed ? collapsedRailWidthPx : rosterRailWidthPx }}
      aria-label="Villagers"
    >
      <div className="rail-header">
        {!isCollapsed && <span className="rail-title">Villagers</span>}
        <button
          className="icon-button"
          onClick={() => onCollapsedChange(!isCollapsed)}
          title={isCollapsed ? "Show villagers" : "Hide villagers"}
        >
          {isCollapsed ? "»" : "«"}
        </button>
      </div>
      {state.agents.length === 0 && !isCollapsed && (
        <p className="muted rail-empty">No agents yet</p>
      )}
      <div className="rail-list">
        {state.agents.map((agent) => {
          const isSelected = agent.id === state.inspectedAgentId;
          return isCollapsed ? (
            <button
              key={agent.id}
              className={isSelected ? "rail-dot is-active" : "rail-dot"}
              onClick={() => selectAgent(isSelected ? null : agent.id)}
              title={agent.name}
            >
              <ColorDot agentId={agent.id} />
            </button>
          ) : (
            <RosterCard key={agent.id} agent={agent} isSelected={isSelected} />
          );
        })}
      </div>
    </nav>
  );
}
