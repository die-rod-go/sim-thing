import { useMemo } from "react";
import {
  PERSON_ENTRY_FIELDS,
  type AgentDetailMessage,
  type AwarenessVia,
  type PersonEntry,
} from "@village/shared";
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

const ENTRY_LABELS: Record<keyof PersonEntry, string> = {
  whatIThinkOfThem: "Thinks of them",
  whatTheyThinkOfMe: "Believes they think",
  whatIWantFromThem: "Wants from them",
  whatTheyWantFromMe: "Believes they want",
};

/** The fields of a person entry that hold something. */
function PersonEntryLines({ entry }: { entry: PersonEntry }) {
  const filled = PERSON_ENTRY_FIELDS.filter((field) => entry[field].trim() !== "");
  if (filled.length === 0) return <p className="relation-notes muted">Nothing held yet.</p>;
  return (
    <dl className="relation-notes">
      {filled.map((field) => (
        <div key={field}>
          <dt className="muted">{ENTRY_LABELS[field]}</dt>
          <dd>{entry[field]}</dd>
        </div>
      ))}
    </dl>
  );
}

function RelationCard({ relation }: { relation: Relation }) {
  return (
    <article className="relation">
      <header className="relation-header">
        <ColorDot agentId={relation.agentId} />
        <AgentName agentId={relation.agentId} name={relation.name} />
        <span className="muted">{relation.profession}</span>
        <span className="relation-counts muted">
          {relation.sharedThreadCount > 0 && pluralize(relation.sharedThreadCount, "talk", "talks")}
        </span>
      </header>
      <LastPerceived relation={relation} />
      {relation.entry !== null && <PersonEntryLines entry={relation.entry} />}
    </article>
  );
}

/** Everyone else from this agent's side: what it last perceived of them and what it holds. */
export function RelationsTab({ detail }: { detail: AgentDetailMessage }) {
  const { state, threads } = usePanelContext();
  const relations = useMemo(
    () =>
      buildRelations(
        detail.agent,
        state.agents,
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
