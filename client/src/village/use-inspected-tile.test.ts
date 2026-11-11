import { describe, expect, it } from "vitest";
import { findPointedTile } from "./use-inspected-tile";

const map = { width: 10, height: 5 };
const zoomedLayerBox = { left: 100, top: 50, width: 400, height: 200 };

describe("findPointedTile", () => {
  it("finds the tile under the pointer at the layer's current zoom", () => {
    expect(findPointedTile({ x: 100, y: 50 }, zoomedLayerBox, map)).toEqual({ x: 0, y: 0 });
    expect(findPointedTile({ x: 179, y: 131 }, zoomedLayerBox, map)).toEqual({ x: 1, y: 2 });
    expect(findPointedTile({ x: 499, y: 249 }, zoomedLayerBox, map)).toEqual({ x: 9, y: 4 });
  });

  it("finds no tile off the edge of the map", () => {
    expect(findPointedTile({ x: 99, y: 60 }, zoomedLayerBox, map)).toBeNull();
    expect(findPointedTile({ x: 500, y: 60 }, zoomedLayerBox, map)).toBeNull();
  });
});
