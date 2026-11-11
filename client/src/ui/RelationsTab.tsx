import { useMemo } from "react";
import type { AgentDetailMessage, AwarenessVia } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatMinutesAgo } from "../format/formatters";
import { buildRelations, type Relation } from "../format/relations";
import { usePanelContext } from "./panel-context";
import { RelationshipWeb } from "./RelationshipWeb";
import { AgentName, ColorDot, EmptyNote } from "./widgets";

const VIA_VERBS: Record<AwarenessVia, string> = {
  saw: "Saw them",
  heard: "Heard them",
  heard_muffled: "Heard them, muffled,",
};

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function LastPerceived({ relation }: { relation: Relation }) {
  const { awareness, minutesSincePerceived } = relation;
  if (awareness === null || minutesSincePerceived === null) {
    return <p className="relation-perceived muted">Has never perceived them.</p>;
  }
  return (
    <p className="relation-perceived">
      {VIA_VERBS[awareness.via]} at <strong>{awareness.place}</strong>, {awareness.doing}{" "}
      <span className="muted">· {formatMinutesAgo(minutesSincePerceived)}</span>
    </p>
  );
}

function RelationCard({ relation }: { relation: Relation }) {
  const notes = relation.personNotes.slice(0, clientConfig.ui.maxPersonNotesShown);
  return (
    <article className="relation">
      <header className="relation-header">
        <ColorDot agentId={relation.agentId} />
        <AgentName agentId={relation.agentId} name={relation.name} />
        <span className="muted">{relation.profession}</span>
        <span className="relation-counts muted">
          {relation.sharedThreadCount > 0 &&
            `${pluralize(relation.sharedThreadCount, "talk", "talks")} · `}
          {pluralize(relation.memoryCount, "memory", "memories")}
        </span>
      </header>
      <LastPerceived relation={relation} />
      {notes.length > 0 && (
        <ul className="relation-notes">
          {notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Everyone else from this agent's side: what it last perceived of them and what it noted. */
export function RelationsTab({ detail }: { detail: AgentDetailMessage }) {
  const { state, threads } = usePanelContext();
  const relations = useMemo(
    () =>
      buildRelations(
        detail.agent,
        state.agents,
        detail.memories,
        threads,
        state.clock.tick,
        state.timeSettings.minutesPerTick,
      ),
    [detail, state.agents, threads, state.clock.tick, state.timeSettings.minutesPerTick],
  );
  if (relations.length === 0) return <EmptyNote>Nobody else lives here.</EmptyNote>;
  return (
    <div className="relations">
      <RelationshipWeb
        agentId={detail.agent.id}
        agentName={detail.agent.name}
        relations={relations}
      />
      {relations.map((relation) => (
        <RelationCard key={relation.agentId} relation={relation} />
      ))}
    </div>
  );
}
