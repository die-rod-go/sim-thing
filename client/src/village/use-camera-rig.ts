import { useCallback, useMemo, useRef, useState } from "react";
import type { Position } from "@village/shared";
import { clientConfig } from "../client-config";
import type { Size } from "./camera";
import {
  focusCamera,
  initialCameraController,
  panCamera,
  setCameraMode,
  stepCameraController,
  zoomCameraAt,
  type CameraController,
  type CameraFocusRequest,
  type CameraMode,
} from "./camera-controller";

const NO_SIZE: Size = { width: 0, height: 0 };

/**
 * Stable handles on the camera. State lives in refs because the frame loop reads and advances
 * it every frame; these functions never change identity, so listeners using them stay attached.
 */
export interface CameraControls {
  /** Sizes the frame loop and the controls work against; set by the village view. */
  viewSizeRef: { current: Size };
  mapSizeRef: { current: Size };
  advanceFrame: (
    positions: ReadonlyMap<string, Position>,
    tileSize: number,
    followedAgentId: string | null,
    nowMs: number,
  ) => CameraController;
  zoomAt: (zoomFactor: number, screenPoint: Position) => void;
  zoomByStep: (direction: 1 | -1) => void;
  pan: (deltaX: number, deltaY: number) => void;
  fit: () => void;
  toggleFollow: () => void;
  focus: (request: CameraFocusRequest) => void;
}

export interface CameraRig {
  /** React state, for button highlights. */
  mode: CameraMode;
  controls: CameraControls;
}

export function useCameraRig(): CameraRig {
  const controllerRef = useRef<CameraController>(initialCameraController);
  const viewSizeRef = useRef<Size>(NO_SIZE);
  const mapSizeRef = useRef<Size>(NO_SIZE);
  const [mode, setMode] = useState<CameraMode>(initialCameraController.mode);

  const update = useCallback((change: (controller: CameraController) => CameraController) => {
    const next = change(controllerRef.current);
    controllerRef.current = next;
    setMode(next.mode);
  }, []);

  const advanceFrame = useCallback<CameraControls["advanceFrame"]>(
    (positions, tileSize, followedAgentId, nowMs) => {
      const previousMode = controllerRef.current.mode;
      const next = stepCameraController(controllerRef.current, {
        view: viewSizeRef.current,
        map: mapSizeRef.current,
        tileSize,
        positions,
        followedAgentId,
        nowMs,
      });
      controllerRef.current = next;
      if (next.mode !== previousMode) setMode(next.mode);
      return next;
    },
    [],
  );

  const zoomAt = useCallback(
    (zoomFactor: number, screenPoint: Position) =>
      update((controller) =>
        zoomCameraAt(controller, zoomFactor, screenPoint, viewSizeRef.current, mapSizeRef.current),
      ),
    [update],
  );

  const zoomByStep = useCallback(
    (direction: 1 | -1) => {
      const view = viewSizeRef.current;
      const factor = clientConfig.camera.buttonZoomFactor ** direction;
      zoomAt(factor, { x: view.width / 2, y: view.height / 2 });
    },
    [zoomAt],
  );

  const pan = useCallback(
    (deltaX: number, deltaY: number) =>
      update((controller) =>
        panCamera(controller, deltaX, deltaY, viewSizeRef.current, mapSizeRef.current),
      ),
    [update],
  );

  const fit = useCallback(() => update((controller) => setCameraMode(controller, "fit")), [update]);

  const toggleFollow = useCallback(
    () =>
      update((controller) =>
        setCameraMode(controller, controller.mode === "follow" ? "free" : "follow"),
      ),
    [update],
  );

  const focus = useCallback(
    (request: CameraFocusRequest) => update((controller) => focusCamera(controller, request)),
    [update],
  );

  const controls = useMemo<CameraControls>(
    () => ({
      viewSizeRef,
      mapSizeRef,
      advanceFrame,
      zoomAt,
      zoomByStep,
      pan,
      fit,
      toggleFollow,
      focus,
    }),
    [advanceFrame, zoomAt, zoomByStep, pan, fit, toggleFollow, focus],
  );
  return { mode, controls };
}
