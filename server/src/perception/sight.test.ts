import { describe, expect, it } from "vitest";
import { config } from "../config";
import { tileIndex } from "../world/types";
import { canSee, computeVisibleTiles } from "./sight";
import { buildAsciiWorld, requireMarker } from "./test-grid";

const range = config.perception.sightRangeTiles;

function canMarkerSee(art: string, viewer: string, target: string): boolean {
  const asciiWorld = buildAsciiWorld(art);
  return canSee(
    asciiWorld.world,
    requireMarker(asciiWorld, viewer),
    requireMarker(asciiWorld, target),
    range,
  );
}

describe("sight", () => {
  it("sees along an open corridor", () => {
    const art = `
      #############
      #a.........b#
      #############`;
    expect(canMarkerSee(art, "a", "b")).toBe(true);
  });

  it("walls block sight", () => {
    const art = `
      #######
      #a.#.b#
      #######`;
    expect(canMarkerSee(art, "a", "b")).toBe(false);
  });

  it("closed door blocks sight but open door does not", () => {
    expect(canMarkerSee("#a.D.b#", "a", "b")).toBe(false);
    expect(canMarkerSee("#a.O.b#", "a", "b")).toBe(true);
  });

  it("out of range is not seen", () => {
    expect(canMarkerSee("#a.............b#", "a", "b")).toBe(false);
  });

  it("sees a tile exactly at the edge of range", () => {
    expect(canMarkerSee("#a...........b#", "a", "b")).toBe(true);
  });

  it("no seeing through diagonal wall corners", () => {
    const art = `
      ....
      .a#.
      .#b.
      ....`;
    expect(canMarkerSee(art, "a", "b")).toBe(false);
    expect(canMarkerSee(art, "b", "a")).toBe(false);
  });

  it("sees past a single diagonal wall corner", () => {
    const art = `
      ....
      .a#.
      ..b.
      ....`;
    expect(canMarkerSee(art, "a", "b")).toBe(true);
  });

  it("sees an agent standing in a doorway and from inside one", () => {
    expect(canMarkerSee("#a..b#", "a", "b")).toBe(true);
    const asciiWorld = buildAsciiWorld("#a.D#");
    const doorway = { x: 3, y: 0 };
    expect(canSee(asciiWorld.world, requireMarker(asciiWorld, "a"), doorway, range)).toBe(true);
    expect(canSee(asciiWorld.world, doorway, requireMarker(asciiWorld, "a"), range)).toBe(true);
  });

  it("is symmetric between viewer and target", () => {
    const { world } = buildAsciiWorld(`
      ..........
      ..#....#..
      ....##....
      .#..D...#.
      ......#...
      ..#.......`);
    for (let fromIndex = 0; fromIndex < world.grid.isWall.length; fromIndex += 1) {
      for (let toIndex = 0; toIndex < world.grid.isWall.length; toIndex += 1) {
        const from = {
          x: fromIndex % world.grid.width,
          y: Math.floor(fromIndex / world.grid.width),
        };
        const to = { x: toIndex % world.grid.width, y: Math.floor(toIndex / world.grid.width) };
        expect(canSee(world, from, to, range)).toBe(canSee(world, to, from, range));
      }
    }
  });

  it("lists visible tiles for the overlay, excluding tiles behind walls", () => {
    const asciiWorld = buildAsciiWorld(`
      #######
      #a.#.b#
      #######`);
    const { grid } = asciiWorld.world;
    const visibleTiles = computeVisibleTiles(
      asciiWorld.world,
      requireMarker(asciiWorld, "a"),
      range,
    );
    expect(visibleTiles).toContain(tileIndex(grid, { x: 2, y: 1 }));
    expect(visibleTiles).toContain(tileIndex(grid, { x: 3, y: 1 }));
    expect(visibleTiles).not.toContain(tileIndex(grid, requireMarker(asciiWorld, "b")));
  });
});
