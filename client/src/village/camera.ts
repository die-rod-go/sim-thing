import type { Position } from "@village/shared";

/** Where the camera looks: a zoom (screen pixels per map pixel) and the map point at view center. */
export interface Camera {
  zoom: number;
  centerX: number;
  centerY: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ZoomLimits {
  minZoom: number;
  maxZoom: number;
}

/** Largest zoom that shows the whole map; fractional, so the map fills the view at any size. */
export function computeFitZoom(
  viewWidth: number,
  viewHeight: number,
  mapPixelWidth: number,
  mapPixelHeight: number,
): number {
  const exactZoom = Math.min(viewWidth / mapPixelWidth, viewHeight / mapPixelHeight);
  if (!Number.isFinite(exactZoom) || exactZoom <= 0) return 1;
  return exactZoom;
}

export function computeFitCamera(view: Size, map: Size): Camera {
  return {
    zoom: computeFitZoom(view.width, view.height, map.width, map.height),
    centerX: map.width / 2,
    centerY: map.height / 2,
  };
}

export function computeZoomLimits(
  view: Size,
  map: Size,
  maxZoom: number,
  minZoomRelativeToFit: number,
): ZoomLimits {
  const fitZoom = computeFitZoom(view.width, view.height, map.width, map.height);
  return { minZoom: fitZoom * minZoomRelativeToFit, maxZoom: Math.max(maxZoom, fitZoom) };
}

/** Keeps the zoom within limits and the view center over the map. */
export function clampCamera(camera: Camera, map: Size, limits: ZoomLimits): Camera {
  return {
    zoom: Math.min(Math.max(camera.zoom, limits.minZoom), limits.maxZoom),
    centerX: Math.min(Math.max(camera.centerX, 0), map.width),
    centerY: Math.min(Math.max(camera.centerY, 0), map.height),
  };
}

export function mapToScreen(point: Position, camera: Camera, view: Size): Position {
  return {
    x: (point.x - camera.centerX) * camera.zoom + view.width / 2,
    y: (point.y - camera.centerY) * camera.zoom + view.height / 2,
  };
}

export function screenToMap(point: Position, camera: Camera, view: Size): Position {
  return {
    x: (point.x - view.width / 2) / camera.zoom + camera.centerX,
    y: (point.y - view.height / 2) / camera.zoom + camera.centerY,
  };
}

/** Changes the zoom while keeping the map point under `screenPoint` where it is on screen. */
export function zoomAtScreenPoint(
  camera: Camera,
  nextZoom: number,
  screenPoint: Position,
  view: Size,
): Camera {
  const anchor = screenToMap(screenPoint, camera, view);
  return {
    zoom: nextZoom,
    centerX: anchor.x - (screenPoint.x - view.width / 2) / nextZoom,
    centerY: anchor.y - (screenPoint.y - view.height / 2) / nextZoom,
  };
}

/** Moves the camera so the map follows a pointer dragged by the given screen distance. */
export function panByScreenDelta(camera: Camera, deltaX: number, deltaY: number): Camera {
  return {
    zoom: camera.zoom,
    centerX: camera.centerX - deltaX / camera.zoom,
    centerY: camera.centerY - deltaY / camera.zoom,
  };
}

/** A camera that frames every point with `padding` map pixels around them, or null if none. */
export function computeFramingCamera(
  points: readonly Position[],
  view: Size,
  padding: number,
  maxZoom: number,
): Camera | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const right = Math.max(...xs) + padding;
  const top = Math.min(...ys) - padding;
  const bottom = Math.max(...ys) + padding;
  const zoom = computeFitZoom(view.width, view.height, right - left, bottom - top);
  return {
    zoom: Math.min(zoom, maxZoom),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/** Moves `current` toward `target`, covering half the gap every `halfLifeMs`. */
export function easeCamera(
  current: Camera,
  target: Camera,
  elapsedMs: number,
  halfLifeMs: number,
  settleEpsilon: number,
): Camera {
  const isSettled =
    Math.abs(current.zoom - target.zoom) < settleEpsilon &&
    Math.abs(current.centerX - target.centerX) < settleEpsilon &&
    Math.abs(current.centerY - target.centerY) < settleEpsilon;
  if (isSettled || halfLifeMs <= 0) return target;
  const progress = 1 - 0.5 ** (Math.max(elapsedMs, 0) / halfLifeMs);
  const blend = (from: number, to: number) => from + (to - from) * progress;
  return {
    zoom: blend(current.zoom, target.zoom),
    centerX: blend(current.centerX, target.centerX),
    centerY: blend(current.centerY, target.centerY),
  };
}

/** The CSS transform that draws map pixels where the camera says they go. */
export function computeWorldTransform(camera: Camera, view: Size): string {
  const offsetX = view.width / 2 - camera.centerX * camera.zoom;
  const offsetY = view.height / 2 - camera.centerY * camera.zoom;
  return `translate(${offsetX}px, ${offsetY}px) scale(${camera.zoom})`;
}
