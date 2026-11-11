import { describe, expect, it } from "vitest";
import {
  computeFitZoom,
  computeRegionOutlineEdges,
  pickAgentColor,
  tileCenter,
  tileIndexToPosition,
} from "./village-geometry";

const MAP_WIDTH = 40;

describe("villageGeometry", () => {
  it("converts tile indexes using y * width + x", () => {
    expect(tileIndexToPosition(0, MAP_WIDTH)).toEqual({ x: 0, y: 0 });
    expect(tileIndexToPosition(2 * MAP_WIDTH + 5, MAP_WIDTH)).toEqual({ x: 5, y: 2 });
  });

  it("centers a position in its tile", () => {
    expect(tileCenter({ x: 2, y: 1 }, 16)).toEqual({ x: 40, y: 24 });
  });

  it("outlines a single tile with four edges", () => {
    expect(computeRegionOutlineEdges([0], MAP_WIDTH)).toHaveLength(4);
  });

  it("omits the shared edge between adjacent tiles", () => {
    expect(computeRegionOutlineEdges([0, 1], MAP_WIDTH)).toHaveLength(6);
  });

  it("does not join tiles that wrap across a row end", () => {
    const lastInRow = MAP_WIDTH - 1;
    expect(computeRegionOutlineEdges([lastInRow, MAP_WIDTH], MAP_WIDTH)).toHaveLength(8);
  });

  it("prefers whole-number zoom when the map fits at least once", () => {
    expect(computeFitZoom(1400, 1000, 640, 480)).toBe(2);
    expect(computeFitZoom(320, 480, 640, 480)).toBe(0.5);
    expect(computeFitZoom(0, 0, 640, 480)).toBe(1);
  });

  it("gives neighboring agents different colors", () => {
    expect(pickAgentColor(0)).not.toBe(pickAgentColor(1));
  });
});
