import { describe, expect, it } from "vitest";
import {
  clampCamera,
  computeFitCamera,
  computeFitZoom,
  computeFramingCamera,
  easeCamera,
  mapToScreen,
  panByScreenDelta,
  screenToMap,
  zoomAtScreenPoint,
} from "./camera";

const VIEW = { width: 1200, height: 900 };
const MAP = { width: 640, height: 480 };

describe("camera", () => {
  it("fits the map with a fractional zoom instead of rounding down", () => {
    expect(computeFitZoom(1420, 900, 640, 480)).toBeCloseTo(1.875);
    expect(computeFitZoom(320, 480, 640, 480)).toBe(0.5);
    expect(computeFitZoom(0, 0, 640, 480)).toBe(1);
  });

  it("centers the fitted map in the view", () => {
    const camera = computeFitCamera(VIEW, MAP);
    expect(mapToScreen({ x: 320, y: 240 }, camera, VIEW)).toEqual({ x: 600, y: 450 });
  });

  it("converts screen points back to the same map points", () => {
    const camera = { zoom: 2.5, centerX: 100, centerY: 80 };
    const screenPoint = mapToScreen({ x: 37, y: 211 }, camera, VIEW);
    const mapPoint = screenToMap(screenPoint, camera, VIEW);
    expect(mapPoint.x).toBeCloseTo(37);
    expect(mapPoint.y).toBeCloseTo(211);
  });

  it("keeps the map point under the cursor still while zooming", () => {
    const camera = computeFitCamera(VIEW, MAP);
    const cursor = { x: 200, y: 700 };
    const before = screenToMap(cursor, camera, VIEW);
    const zoomed = zoomAtScreenPoint(camera, camera.zoom * 3, cursor, VIEW);
    const after = screenToMap(cursor, zoomed, VIEW);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("moves the map with the dragging pointer", () => {
    const camera = { zoom: 2, centerX: 100, centerY: 100 };
    expect(panByScreenDelta(camera, 40, -20)).toEqual({ zoom: 2, centerX: 80, centerY: 110 });
  });

  it("keeps zoom within limits and the view center over the map", () => {
    const limits = { minZoom: 1, maxZoom: 8 };
    const clamped = clampCamera({ zoom: 50, centerX: -10, centerY: 900 }, MAP, limits);
    expect(clamped).toEqual({ zoom: 8, centerX: 0, centerY: 480 });
  });

  it("frames a group of points with padding, capped at a maximum zoom", () => {
    const points = [
      { x: 100, y: 100 },
      { x: 200, y: 140 },
    ];
    expect(computeFramingCamera(points, VIEW, 50, 20)).toEqual({
      zoom: 6,
      centerX: 150,
      centerY: 120,
    });
    expect(computeFramingCamera([{ x: 10, y: 10 }], VIEW, 16, 4)?.zoom).toBe(4);
    expect(computeFramingCamera([], VIEW, 16, 4)).toBeNull();
  });

  it("eases halfway in one half-life and snaps when close", () => {
    const from = { zoom: 1, centerX: 0, centerY: 0 };
    const to = { zoom: 3, centerX: 100, centerY: -40 };
    expect(easeCamera(from, to, 100, 100, 0.01)).toEqual({ zoom: 2, centerX: 50, centerY: -20 });
    const nearlyThere = { zoom: 3.001, centerX: 100.001, centerY: -40 };
    expect(easeCamera(nearlyThere, to, 16, 100, 0.01)).toBe(to);
  });
});
