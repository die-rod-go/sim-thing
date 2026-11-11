import type { CameraMode } from "./camera-controller";
import type { CameraControls as CameraControlHandles } from "./use-camera-rig";

interface CameraControlsProps {
  mode: CameraMode;
  controls: CameraControlHandles;
  canFollow: boolean;
  isPlaceLabelsOn: boolean;
  onPlaceLabelsChange: (isOn: boolean) => void;
}

/** The floating cluster of map buttons: zoom, fit, follow and place labels. */
export function CameraControls({
  mode,
  controls,
  canFollow,
  isPlaceLabelsOn,
  onPlaceLabelsChange,
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
        className={isPlaceLabelsOn ? "is-active" : undefined}
        title="Show place names"
        onClick={() => onPlaceLabelsChange(!isPlaceLabelsOn)}
      >
        Places
      </button>
    </div>
  );
}
