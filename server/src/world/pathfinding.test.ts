import { describe, expect, it } from "vitest";
import { findPath, findPathToObject, findPathToPlace, listPlaceTiles } from "./pathfinding";
import type { TileGrid, WorldMap } from "./types";

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
    objects: [],
    spawnPoints: {},
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
  it("ends on the nearest walkable tile inside the place, not in its walls or doorway", () => {
    const map = buildRoomMap();
    const path = findPathToPlace(map, { x: 4, y: 0 }, "hut");
    expect(path?.at(-1)).toEqual({ x: 4, y: 2 });
    expect(path).toHaveLength(2);
  });

  it("returns null for an unknown place", () => {
    expect(findPathToPlace(buildRoomMap(), { x: 0, y: 0 }, "castle")).toBeNull();
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
});

describe("findPathToObject", () => {
  it("walks onto a walkable object tile", () => {
    const path = findPathToObject(buildRoomMap(), { x: 0, y: 0 }, { pos: { x: 2, y: 2 } });
    expect(path?.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it("stops next to an object that sits on a blocked tile", () => {
    const path = findPathToObject(buildRoomMap(), { x: 0, y: 4 }, { pos: { x: 3, y: 3 } });
    expect(path?.at(-1)).toEqual({ x: 3, y: 4 });
  });
});
