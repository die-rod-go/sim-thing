import { useMemo, useState } from "react";
import { clientConfig } from "../client-config";
import type { Relation } from "../format/relations";
import { layOutRelationshipWeb } from "../format/relationship-web";
import { usePanelContext } from "./panel-context";

interface RelationshipWebProps {
  agentId: string;
  agentName: string;
  relations: Relation[];
}

function HoveredNotes({ relation }: { relation: Relation | undefined }) {
  if (!relation) return <p className="web-caption muted">Point at someone to read their notes.</p>;
  const notes = relation.personNotes.slice(0, clientConfig.ui.maxPersonNotesShown);
  return (
    <div className="web-caption">
      <strong>{relation.name}</strong>
      {notes.length === 0 ? (
        <span className="muted"> · no notes about them</span>
      ) : (
        <ul className="relation-notes">
          {notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Who this agent has talked with lately; thicker lines mean more was said. Click to switch. */
export function RelationshipWeb({ agentId, agentName, relations }: RelationshipWebProps) {
  const { threads, agentColors, selectAgent } = usePanelContext();
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const geometry = clientConfig.relationshipWeb;
  const layout = useMemo(
    () =>
      layOutRelationshipWeb(
        agentId,
        relations.map((relation) => relation.agentId),
        threads,
        { size: geometry.sizePx, ringRadius: geometry.ringRadiusPx },
      ),
    [agentId, relations, threads, geometry.sizePx, geometry.ringRadiusPx],
  );
  if (layout.nodes.length === 0) return null;
  const relationsById = new Map(relations.map((relation) => [relation.agentId, relation]));
  const edgeWidthRange = geometry.maxEdgeWidthPx - geometry.minEdgeWidthPx;

  return (
    <section className="relationship-web">
      <svg
        width={geometry.sizePx}
        height={geometry.sizePx}
        viewBox={`0 0 ${geometry.sizePx} ${geometry.sizePx}`}
        role="img"
        aria-label={`Who ${agentName} has talked with`}
      >
        {layout.nodes.map((node) => (
          <line
            key={`edge-${node.agentId}`}
            className="web-edge"
            x1={layout.center.x}
            y1={layout.center.y}
            x2={node.position.x}
            y2={node.position.y}
            strokeWidth={
              geometry.minEdgeWidthPx +
              (edgeWidthRange * node.sharedLineCount) / layout.maxSharedLineCount
            }
          />
        ))}
        <circle
          className="web-center"
          cx={layout.center.x}
          cy={layout.center.y}
          r={geometry.centerRadiusPx}
          fill={agentColors.get(agentId)}
        />
        {layout.nodes.map((node) => {
          const relation = relationsById.get(node.agentId);
          return (
            <g
              key={node.agentId}
              className="web-node"
              onPointerEnter={() => setHoveredAgentId(node.agentId)}
              onPointerLeave={() => setHoveredAgentId(null)}
              onClick={() => selectAgent(node.agentId)}
            >
              <title>{`${relation?.name ?? node.agentId}: ${node.sharedLineCount} lines`}</title>
              <circle
                cx={node.position.x}
                cy={node.position.y}
                r={geometry.nodeRadiusPx}
                fill={agentColors.get(node.agentId)}
              />
              <text
                x={node.position.x}
                y={node.position.y + geometry.nodeRadiusPx * 2}
                textAnchor="middle"
              >
                {relation?.name ?? node.agentId}
              </text>
            </g>
          );
        })}
      </svg>
      <HoveredNotes
        relation={hoveredAgentId === null ? undefined : relationsById.get(hoveredAgentId)}
      />
    </section>
  );
}
