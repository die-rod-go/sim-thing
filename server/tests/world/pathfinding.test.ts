import { describe, expect, it } from "vitest";
import {
  findNearestFreeTile,
  findPath,
  findPathToPlace,
  findPathToTile,
  listDoorwayTiles,
  listPlaceTiles,
  withBlockedTiles,
} from "../../src/world/pathfinding";
import type { TileGrid, WorldMap } from "../../src/world/types";

/** Builds a grid from rows of text: "#" is a wall, anything else is open floor. */
function buildGrid(rows: string[]): TileGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    isWall: rows.flatMap((row) => [...row].map((character) => character === "#")),
  };
}

const roomRows = [".......", ".###.#.", ".#...#.", ".#####.", "......."];

function buildRoomMap(): WorldMap {
  const grid = buildGrid(roomRows);
  return {
    grid,
    places: [{ name: "hut", isIndoor: true, x: 1, y: 1, width: 5, height: 3 }],
    placements: [],
    startTiles: {},
  };
}

function isFourConnected(path: { x: number; y: number }[], start: { x: number; y: number }) {
  let previous = start;
  for (const step of path) {
    if (Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y) !== 1) return false;
    previous = step;
  }
  return true;
}

describe("findPath", () => {
  it("finds a shortest 4-connected path that avoids walls", () => {
    const grid = buildGrid(roomRows);
    const start = { x: 0, y: 0 };
    const path = findPath(grid, start, { x: 3, y: 2 });
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 3, y: 2 });
    expect(isFourConnected(path ?? [], start)).toBe(true);
    expect(path?.every((step) => !grid.isWall[step.y * grid.width + step.x])).toBe(true);
    expect(path).toHaveLength(7);
  });

  it("returns an empty path when already at the goal", () => {
    expect(findPath(buildGrid(roomRows), { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it("returns null when the goal is walled off or is a wall", () => {
    const grid = buildGrid(["..#..", "..#..", "..#.."]);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});

describe("findPathToPlace", () => {
  it("ends on the most central walkable tile inside the place, not in its walls or doorway", () => {
    const map = buildRoomMap();
    const path = findPathToPlace(map, map.grid, { x: 4, y: 0 }, "hut");
    expect(path?.at(-1)).toEqual({ x: 3, y: 2 });
    expect(path).toHaveLength(3);
  });

  it("ends on the next most central tile when the center is taken", () => {
    const map = buildRoomMap();
    const grid = withBlockedTiles(map.grid, new Set([2 * map.grid.width + 3]));
    const path = findPathToPlace(map, grid, { x: 4, y: 0 }, "hut");
    expect(path?.at(-1)).toEqual({ x: 4, y: 2 });
  });

  it("stops away from the doorway when there is room further in", () => {
    const map = buildRoomMap();
    const path = findPathToPlace(map, map.grid, { x: 4, y: 0 }, "hut", 2);
    expect(path?.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it("stops by the doorway when every tile is that close to it", () => {
    const map = buildRoomMap();
    const path = findPathToPlace(map, map.grid, { x: 4, y: 0 }, "hut", 3);
    expect(path?.at(-1)).toEqual({ x: 3, y: 2 });
  });

  it("returns null for an unknown place", () => {
    const map = buildRoomMap();
    expect(findPathToPlace(map, map.grid, { x: 0, y: 0 }, "castle")).toBeNull();
  });

  it("lists only interior floor tiles for an indoor place", () => {
    const map = buildRoomMap();
    const hut = map.places[0];
    if (!hut) throw new Error("no hut");
    expect(listPlaceTiles(map.grid, hut)).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it("finds the gap in an indoor place's walls as its doorway", () => {
    const map = buildRoomMap();
    const hut = map.places[0];
    if (!hut) throw new Error("no hut");
    expect(listDoorwayTiles(map.grid, hut)).toEqual([{ x: 4, y: 1 }]);
    expect(listDoorwayTiles(map.grid, { ...hut, isIndoor: false })).toEqual([]);
  });
});

describe("findPathToTile", () => {
  it("walks onto a walkable tile", () => {
    const path = findPathToTile(buildRoomMap().grid, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path?.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it("stops next to a blocked tile", () => {
    const path = findPathToTile(buildRoomMap().grid, { x: 0, y: 4 }, { x: 3, y: 3 });
    expect(path?.at(-1)).toEqual({ x: 3, y: 4 });
  });

  it("walks around tiles an object blocks and stops beside it", () => {
    const grid = withBlockedTiles(buildGrid([".....", "....."]), new Set([2]));
    const path = findPathToTile(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path?.at(-1)).toEqual({ x: 1, y: 0 });
    expect(findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).not.toContainEqual({ x: 2, y: 0 });
  });
});

describe("findNearestFreeTile", () => {
  it("returns the start tile when nothing stands on it", () => {
    const grid = buildGrid(["...", "..."]);
    expect(findNearestFreeTile(grid, { x: 1, y: 0 }, new Set())).toEqual({ x: 1, y: 0 });
  });

  it("steps to the nearest free floor tile past taken ones and walls", () => {
    const grid = buildGrid([".#..", "...."]);
    expect(findNearestFreeTile(grid, { x: 0, y: 0 }, new Set([0, 4]))).toEqual({ x: 1, y: 1 });
  });

  it("moves a start tile that is a wall onto the nearest floor", () => {
    const grid = buildGrid(["#..", "..."]);
    expect(findNearestFreeTile(grid, { x: 0, y: 0 }, new Set())).toEqual({ x: 1, y: 0 });
  });
});
