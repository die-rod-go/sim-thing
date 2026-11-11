import type { CSSProperties } from "react";
import { clientConfig } from "../client-config";
import type { VisibleCondition } from "../format/conditions";
import type { ActivityCue } from "./activity-cues";
import { FIGURE_SIZE } from "./world-layout";

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
  isHighlighted: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  /** Drawn lying down and greyed out. */
  isDead: boolean;
  /** Drawn over the figure (flames for `burning`). */
  visibleConditions: readonly VisibleCondition[];
  activityCue: ActivityCue;
  markerRef: (element: HTMLElement | null) => void;
  onSelect: (agentId: string) => void;
  onZoomTo: (agentId: string) => void;
  onToggleMute: (agentId: string) => void;
  onHoverStart: (agentId: string) => void;
  onHoverEnd: (agentId: string) => void;
}

function ActivityCueBadge({ cue }: { cue: ActivityCue }) {
  if (cue === null) return null;
  if (cue.kind === "sleep") {
    return (
      <span className="agent-cue agent-cue-sleep" aria-label="asleep">
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </span>
    );
  }
  return (
    <span className="agent-cue" aria-hidden="true">
      {cue.glyph}
    </span>
  );
}

/**
 * One agent on the map, centered on 0,0 in screen pixels: its figure (scaled by the frame loop
 * through `--figure-scale`), name label, activity cue, mute toggle and selection, highlight and
 * speaking rings.
 */
export function AgentMarker({
  agentId,
  name,
  color,
  isSelected,
  isHighlighted,
  isSpeaking,
  isMuted,
  isDead,
  visibleConditions,
  activityCue,
  markerRef,
  onSelect,
  onZoomTo,
  onToggleMute,
  onHoverStart,
  onHoverEnd,
}: AgentMarkerProps) {
  const ringDiameter = clientConfig.village.selectionRingRadius * 2;
  const classNames = ["agent-marker"];
  if (isSelected) classNames.push("is-selected");
  if (isHighlighted) classNames.push("is-highlighted");
  if (isSpeaking) classNames.push("is-speaking");
  if (isMuted) classNames.push("is-muted");
  if (isDead) classNames.push("is-dead");
  return (
    <div
      className={classNames.join(" ")}
      ref={markerRef}
      style={{ "--ring-diameter": `${ringDiameter}px` } as CSSProperties}
    >
      {isSpeaking && <div className="agent-ring agent-ring-speaking" />}
      {isHighlighted && <div className="agent-ring agent-ring-highlight" />}
      {isSelected && <div className="agent-ring agent-ring-selected" />}
      <button
        type="button"
        className="agent-figure"
        aria-label={`Inspect ${name}; double-click to zoom in`}
        onClick={() => onSelect(agentId)}
        onDoubleClick={() => onZoomTo(agentId)}
        onPointerEnter={(event) => {
          // A pointer that arrives with a button held is mid-drag, not resting on the agent.
          if (event.buttons === 0) onHoverStart(agentId);
        }}
        onPointerLeave={() => onHoverEnd(agentId)}
        onPointerDown={() => onHoverEnd(agentId)}
      >
        <svg viewBox={`0 0 ${FIGURE_SIZE} ${FIGURE_SIZE}`}>
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
      <button
        type="button"
        className="agent-mute"
        aria-pressed={isMuted}
        aria-label={isMuted ? `Show ${name}'s speech bubbles` : `Hide ${name}'s speech bubbles`}
        title={isMuted ? "Show speech bubbles" : "Hide speech bubbles"}
        onClick={() => onToggleMute(agentId)}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>
      {visibleConditions.map((condition) => (
        <span
          key={condition.name}
          className={`condition-overlay condition-${condition.name}`}
          title={condition.words}
          aria-label={condition.words}
        />
      ))}
      <ActivityCueBadge cue={activityCue} />
      <span className="agent-label">{name}</span>
    </div>
  );
}
