import { formatSimTime, TRAIT_NAMES, type Agent, type AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { usePanelContext } from "./panel-context";
import { EmptyNote, PanelSection, TraitRow } from "./widgets";

function PersonalityHistory({ detail }: { detail: AgentDetailMessage }) {
  const { state } = usePanelContext();
  const changes = [...detail.personalityHistory]
    .sort((first, second) => second.tick - first.tick)
    .slice(0, clientConfig.ui.maxPersonalityHistoryShown);
  if (changes.length === 0) return <EmptyNote>Hasn't changed yet.</EmptyNote>;
  return (
    <ol className="change-log">
      {changes.map((change) => (
        <li key={change.id}>
          <div className="change-meta">
            {formatSimTime(change.tick, state.timeSettings)} · <strong>{change.field}</strong>
          </div>
          <div className="change-values">
            <span className="change-old">{change.oldValue}</span> →{" "}
            <span className="change-new">{change.newValue}</span>
          </div>
          <div className="change-reason">{change.reason}</div>
        </li>
      ))}
    </ol>
  );
}

export function PersonalityTab({
  agent,
  detail,
}: {
  agent: Agent;
  detail: AgentDetailMessage | null;
}) {
  const { personality } = agent;
  return (
    <div className="personality">
      <PanelSection title="Who they are">
        <p className="prose">{personality.core}</p>
      </PanelSection>
      <PanelSection title="How they see themselves">
        <p className="prose self-image">{personality.selfImage}</p>
      </PanelSection>
      {personality.voice ? (
        <PanelSection title="How they talk">
          <p className="prose">{personality.voice}</p>
        </PanelSection>
      ) : null}
      {personality.routine ? (
        <PanelSection title="Their usual day">
          <p className="prose">{personality.routine}</p>
        </PanelSection>
      ) : null}
      <PanelSection title="Traits">
        {TRAIT_NAMES.map((traitName) => (
          <TraitRow key={traitName} traitName={traitName} value={personality.traits[traitName]} />
        ))}
      </PanelSection>
      <PanelSection title="How they have changed">
        {detail ? <PersonalityHistory detail={detail} /> : <EmptyNote>Loading…</EmptyNote>}
      </PanelSection>
    </div>
  );
}
