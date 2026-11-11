import { NEED_NAMES, type Agent } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatCarrying, formatClockTime } from "../format/character-sheet";
import { usePanelContext } from "./panel-context";
import { EmptyNote, NeedRow, PanelSection } from "./widgets";

function RecentLines({ agent }: { agent: Agent }) {
  const { state } = usePanelContext();
  const lines = state.events
    .filter((event) => event.actorId === agent.id && event.speech !== undefined)
    .slice(-clientConfig.ui.maxRecentLinesShown)
    .reverse();
  if (lines.length === 0) return <EmptyNote>Hasn't said anything lately.</EmptyNote>;
  return (
    <ul className="quote-list">
      {lines.map((event) => (
        <li key={event.id}>
          <span className="line-time">{formatClockTime(event.tick, state.timeSettings)}</span>
          <span className={`line-words volume-${event.speech?.volume ?? "normal"}`}>
            “{event.speech?.words}”
          </span>
          <span className="muted"> at {event.place}</span>
        </li>
      ))}
    </ul>
  );
}

export function OverviewTab({ agent }: { agent: Agent }) {
  return (
    <div className="overview">
      <PanelSection title="Needs">
        <div className="need-grid">
          {NEED_NAMES.map((needName) => (
            <NeedRow key={needName} needName={needName} value={agent.needs[needName]} />
          ))}
        </div>
      </PanelSection>
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
      <PanelSection title="Lately said">
        <RecentLines agent={agent} />
      </PanelSection>
    </div>
  );
}
