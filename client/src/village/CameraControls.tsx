import type { CameraMode } from "./camera-controller";
import { nextThoughtMode, THOUGHT_MODE_LABELS, type ThoughtMode } from "./thought-bubbles";
import type { CameraControls as CameraControlHandles } from "./use-camera-rig";

interface CameraControlsProps {
  mode: CameraMode;
  controls: CameraControlHandles;
  canFollow: boolean;
  isPlaceLabelsOn: boolean;
  onPlaceLabelsChange: (isOn: boolean) => void;
  thoughtMode: ThoughtMode;
  onThoughtModeChange: (mode: ThoughtMode) => void;
  isDirectorOn: boolean;
  onDirectorChange: (isOn: boolean) => void;
}

const THOUGHT_BUTTON_TEXT: Record<ThoughtMode, string> = {
  selected: "💭 1",
  everyone: "💭 all",
  off: "💭 off",
};

/** The floating cluster of map buttons: zoom, fit, follow, director, place labels, thoughts. */
export function CameraControls({
  mode,
  controls,
  canFollow,
  isPlaceLabelsOn,
  onPlaceLabelsChange,
  thoughtMode,
  onThoughtModeChange,
  isDirectorOn,
  onDirectorChange,
}: CameraControlsProps) {
  return (
    <div className="camera-controls" role="toolbar" aria-label="Map view">
      <button type="button" title="Zoom in (+)" onClick={() => controls.zoomByStep(1)}>
        +
      </button>
      <button type="button" title="Zoom out (−)" onClick={() => controls.zoomByStep(-1)}>
        −
      </button>
      <button
        type="button"
        className={mode === "fit" ? "is-active" : undefined}
        title="Fit the whole village (0)"
        onClick={controls.fit}
      >
        Fit
      </button>
      <button
        type="button"
        className={mode === "follow" ? "is-active" : undefined}
        title={canFollow ? "Follow the selected agent (F)" : "Select an agent to follow"}
        disabled={!canFollow}
        onClick={controls.toggleFollow}
      >
        Follow
      </button>
      <button
        type="button"
        className={isDirectorOn ? "is-active" : undefined}
        title="Director: the camera cuts to the liveliest conversation; any pan or zoom stops it"
        aria-label="Director mode"
        onClick={() => onDirectorChange(!isDirectorOn)}
      >
        🎬
      </button>
      <button
        type="button"
        className={isPlaceLabelsOn ? "is-active" : undefined}
        title="Show place names"
        onClick={() => onPlaceLabelsChange(!isPlaceLabelsOn)}
      >
        Places
      </button>
      <button
        type="button"
        className={thoughtMode === "off" ? undefined : "is-active"}
        title={`${THOUGHT_MODE_LABELS[thoughtMode]} (click to change)`}
        aria-label={THOUGHT_MODE_LABELS[thoughtMode]}
        onClick={() => onThoughtModeChange(nextThoughtMode(thoughtMode))}
      >
        {THOUGHT_BUTTON_TEXT[thoughtMode]}
      </button>
    </div>
  );
}
