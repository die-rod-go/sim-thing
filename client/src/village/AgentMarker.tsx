import { useEffect, useRef, type CSSProperties } from "react";
import { GLYPH_SHEET } from "@village/shared";
import { clientConfig } from "../client-config";
import type { VisibleComponent } from "../format/conditions";
import type { ActivityCue } from "./activity-cues";
import type { GlyphPainter } from "./glyph-painter";

interface AgentMarkerProps {
  agentId: string;
  name: string;
  color: string;
  glyphPainter: GlyphPainter;
  isSelected: boolean;
  isHighlighted: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  /** Drawn lying down and greyed out. */
  isDead: boolean;
  /** The player's own agent, labelled as such. */
  isPlayed: boolean;
  /** Drawn over the figure (flames for `burning`). */
  visibleConditions: readonly VisibleComponent[];
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

const { glyphSizePixels } = GLYPH_SHEET;
const OUTLINE_WIDTH = 1;
const OUTLINED_SIZE = glyphSizePixels + OUTLINE_WIDTH * 2;
const OUTLINE_OFFSETS = [-1, 0, 1].flatMap((offsetX) =>
  [-1, 0, 1].map((offsetY) => ({ x: offsetX * OUTLINE_WIDTH, y: offsetY * OUTLINE_WIDTH })),
);

/**
 * The agent's glyph in its color with a dark outline, drawn at the sheet's own pixel size. CSS
 * scales it so the glyph fills one figure, which matches one map tile.
 */
function AgentGlyph({ color, glyphPainter }: { color: string; glyphPainter: GlyphPainter }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for an agent");
    const { agentGlyphIndex, agentOutlineColor } = clientConfig.village;
    context.clearRect(0, 0, OUTLINED_SIZE, OUTLINED_SIZE);
    const drawAt = (offset: { x: number; y: number }, glyphColor: string) =>
      glyphPainter.drawGlyph(
        context,
        { index: agentGlyphIndex, color: glyphColor },
        {
          x: OUTLINE_WIDTH + offset.x,
          y: OUTLINE_WIDTH + offset.y,
          width: glyphSizePixels,
          height: glyphSizePixels,
        },
      );
    for (const offset of OUTLINE_OFFSETS) drawAt(offset, agentOutlineColor);
    drawAt({ x: 0, y: 0 }, color);
  }, [color, glyphPainter]);

  return (
    <canvas
      className="agent-glyph"
      ref={canvasRef}
      width={OUTLINED_SIZE}
      height={OUTLINED_SIZE}
      style={{ "--outlined-glyph-ratio": OUTLINED_SIZE / glyphSizePixels } as CSSProperties}
    />
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
  glyphPainter,
  isSelected,
  isHighlighted,
  isSpeaking,
  isMuted,
  isDead,
  isPlayed,
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
  if (isPlayed) classNames.push("is-played");
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
        <AgentGlyph color={color} glyphPainter={glyphPainter} />
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
      <span className="agent-label">{isPlayed ? `${name} (you)` : name}</span>
    </div>
  );
}
