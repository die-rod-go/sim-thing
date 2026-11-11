import { clientConfig } from "../client-config";

const FIGURE_SIZE = 12;
const FIGURE_CENTER = FIGURE_SIZE / 2;
const HEAD_RADIUS = 3;
const BODY_TOP = 5;
const BODY_WIDTH = 8;
const BODY_HEIGHT = 7;
const BODY_CORNER_RADIUS = 2;

interface AgentMarkerProps {
  agentId: string;
  name: string;
  color: string;
  isSelected: boolean;
  markerRef: (element: HTMLElement | null) => void;
  onSelect: (agentId: string) => void;
}

/** One agent on the map: a colored figure, a name label and a selection ring, centered on 0,0. */
export function AgentMarker({
  agentId,
  name,
  color,
  isSelected,
  markerRef,
  onSelect,
}: AgentMarkerProps) {
  const ringDiameter = clientConfig.village.selectionRingRadius * 2;
  return (
    <div className="agent-marker" ref={markerRef}>
      {isSelected && (
        <div className="agent-ring" style={{ width: ringDiameter, height: ringDiameter }} />
      )}
      <button
        type="button"
        className="agent-figure"
        title={name}
        aria-label={`Inspect ${name}`}
        onClick={() => onSelect(agentId)}
      >
        <svg width={FIGURE_SIZE} height={FIGURE_SIZE} viewBox={`0 0 ${FIGURE_SIZE} ${FIGURE_SIZE}`}>
          <rect
            x={FIGURE_CENTER - BODY_WIDTH / 2}
            y={BODY_TOP}
            width={BODY_WIDTH}
            height={BODY_HEIGHT}
            rx={BODY_CORNER_RADIUS}
            fill={color}
          />
          <circle
            cx={FIGURE_CENTER}
            cy={HEAD_RADIUS}
            r={HEAD_RADIUS}
            fill={color}
            className="agent-head"
          />
        </svg>
      </button>
      <span className="agent-label">{name}</span>
    </div>
  );
}
