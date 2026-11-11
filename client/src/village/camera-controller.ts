import type { Position } from "@village/shared";
import { clientConfig } from "../client-config";
import {
  clampCamera,
  computeFitCamera,
  computeFramingCamera,
  computeZoomLimits,
  easeCamera,
  panByScreenDelta,
  zoomAtScreenPoint,
  type Camera,
  type Size,
} from "./camera";

/** "fit" shows the whole map and refits on resize; "follow" keeps the inspected agent centered. */
export type CameraMode = "fit" | "free" | "follow";

export type CameraFocusRequest =
  { kind: "agents"; agentIds: readonly string[] } | { kind: "agent"; agentId: string };

export interface CameraController {
  /** What is drawn this frame; null until the first frame with a measured view. */
  current: Camera | null;
  /** Where the camera is easing to. */
  target: Camera | null;
  mode: CameraMode;
  /** A focus asked for before agent positions were at hand; served on the next frame. */
  pendingFocus: CameraFocusRequest | null;
  lastFrameMs: number | null;
}

export interface CameraFrameInput {
  view: Size;
  map: Size;
  tileSize: number;
  positions: ReadonlyMap<string, Position>;
  followedAgentId: string | null;
  nowMs: number;
}

export const initialCameraController: CameraController = {
  current: null,
  target: null,
  mode: "fit",
  pendingFocus: null,
  lastFrameMs: null,
};

function limitsFor(view: Size, map: Size) {
  const { maxZoom, minZoomRelativeToFit } = clientConfig.camera;
  return computeZoomLimits(view, map, maxZoom, minZoomRelativeToFit);
}

function serveFocus(
  request: CameraFocusRequest,
  input: CameraFrameInput,
  fallback: Camera,
): Camera | null {
  const { focusAgentZoom, focusPaddingTiles, focusMaxZoom } = clientConfig.camera;
  if (request.kind === "agent") {
    const position = input.positions.get(request.agentId);
    if (!position) return null;
    return {
      zoom: Math.max(fallback.zoom, focusAgentZoom),
      centerX: position.x,
      centerY: position.y,
    };
  }
  const points = request.agentIds
    .map((agentId) => input.positions.get(agentId))
    .filter((position): position is Position => position !== undefined);
  return computeFramingCamera(points, input.view, focusPaddingTiles * input.tileSize, focusMaxZoom);
}

function chooseTarget(
  controller: CameraController,
  input: CameraFrameInput,
  previousTarget: Camera,
): { target: Camera; mode: CameraMode } {
  if (controller.mode === "fit")
    return { target: computeFitCamera(input.view, input.map), mode: "fit" };
  if (controller.mode === "follow") {
    const followed =
      input.followedAgentId === null ? undefined : input.positions.get(input.followedAgentId);
    if (!followed) return { target: previousTarget, mode: "free" };
    return {
      target: { ...previousTarget, centerX: followed.x, centerY: followed.y },
      mode: "follow",
    };
  }
  return { target: previousTarget, mode: "free" };
}

/** Advances the camera one frame: picks its target from the mode, then eases toward it. */
export function stepCameraController(
  controller: CameraController,
  input: CameraFrameInput,
): CameraController {
  const isMeasured =
    input.view.width > 0 && input.view.height > 0 && input.map.width > 0 && input.map.height > 0;
  if (!isMeasured) return controller;
  const { easeHalfLifeMs, settleEpsilon } = clientConfig.camera;
  const fitCamera = computeFitCamera(input.view, input.map);
  const isFirstFrame = controller.current === null;
  const current = controller.current ?? fitCamera;
  const chosen = chooseTarget(controller, input, controller.target ?? fitCamera);
  const { mode } = chosen;
  let { target } = chosen;
  let pendingFocus = controller.pendingFocus;
  if (pendingFocus) {
    const focused = serveFocus(pendingFocus, input, current);
    if (focused) {
      target = focused;
      pendingFocus = null;
    }
  }
  const limits = limitsFor(input.view, input.map);
  const clampedTarget = clampCamera(target, input.map, limits);
  const elapsedMs = controller.lastFrameMs === null ? 0 : input.nowMs - controller.lastFrameMs;
  return {
    current: isFirstFrame
      ? clampedTarget
      : easeCamera(current, clampedTarget, elapsedMs, easeHalfLifeMs, settleEpsilon),
    target: clampedTarget,
    mode,
    pendingFocus,
    lastFrameMs: input.nowMs,
  };
}

/** Multiplies the zoom around a screen point, immediately; following keeps the agent centered. */
export function zoomCameraAt(
  controller: CameraController,
  zoomFactor: number,
  screenPoint: Position,
  view: Size,
  map: Size,
): CameraController {
  const base = controller.current;
  if (!base) return controller;
  const limits = limitsFor(view, map);
  const nextZoom = Math.min(Math.max(base.zoom * zoomFactor, limits.minZoom), limits.maxZoom);
  const isFollowing = controller.mode === "follow";
  const zoomed = isFollowing
    ? { ...base, zoom: nextZoom }
    : zoomAtScreenPoint(base, nextZoom, screenPoint, view);
  const camera = clampCamera(zoomed, map, limits);
  return { ...controller, current: camera, target: camera, mode: isFollowing ? "follow" : "free" };
}

/** Drags the map with the pointer; this always ends fit and follow. */
export function panCamera(
  controller: CameraController,
  deltaX: number,
  deltaY: number,
  view: Size,
  map: Size,
): CameraController {
  if (!controller.current) return controller;
  const camera = clampCamera(
    panByScreenDelta(controller.current, deltaX, deltaY),
    map,
    limitsFor(view, map),
  );
  return { ...controller, current: camera, target: camera, mode: "free" };
}

export function setCameraMode(controller: CameraController, mode: CameraMode): CameraController {
  return { ...controller, mode, pendingFocus: null };
}

/** Eases to frame the given agents; the camera stops fitting or following. */
export function focusCamera(
  controller: CameraController,
  request: CameraFocusRequest,
): CameraController {
  return { ...controller, mode: "free", pendingFocus: request };
}
