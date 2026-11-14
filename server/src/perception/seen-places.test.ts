import type { ItemDefinition, SeenPlace } from "@village/shared";
import { describe, expect, it } from "vitest";
import { collapseEntityNames, mergeSeenPlaces, sightPlace } from "./seen-places";
import { buildAsciiWorld, requireMarker } from "./test-grid";

const range = 12;

/** A walled hut whose rectangle includes its walls, with a doorway on its west side. */
const HUT = { name: "hut", isIndoor: true, x: 6, y: 0, width: 5, height: 5 };

function sightHut(art: string, isInsideOnly = false) {
  const asciiWorld = buildAsciiWorld(art);
  return sightPlace(asciiWorld.world, requireMarker(asciiWorld, "a"), HUT, range, isInsideOnly);
}

function buildDefinition(id: string, plural?: string): ItemDefinition {
  return {
    id,
    name: id,
    glyph: { index: 1, color: "#ffffff" },
    components: {},
    ...(plural === undefined ? {} : { plural }),
  };
}

describe("sightPlace", () => {
  it("sees a place by its wall alone, without seeing inside", () => {
    const sighting = sightHut(`
      ......#####
      ......#...#
      .a....#...#
      ......#...#
      ......#####`);
    expect(sighting).toEqual({ isInView: true, isInsideInView: false });
  });

  it("sees inside through an open door but not through a closed one", () => {
    const openDoor = sightHut(`
      ......#####
      ......#...#
      .a....O...#
      ......#...#
      ......#####`);
    const closedDoor = sightHut(`
      ......#####
      ......#...#
      .a....D...#
      ......#...#
      ......#####`);
    expect(openDoor.isInsideInView).toBe(true);
    expect(closedDoor).toEqual({ isInView: true, isInsideInView: false });
  });

  it("sees inside from inside", () => {
    const sighting = sightHut(`
      ......#####
      ......#...#
      ......#.a.#
      ......#...#
      ......#####`);
    expect(sighting).toEqual({ isInView: true, isInsideInView: true });
  });

  it("does not see a place hidden behind a wall", () => {
    const sighting = sightHut(`
      ....#.#####
      ....#.#...#
      .a..#.#...#
      ....#.#...#
      ....#.#####`);
    expect(sighting).toEqual({ isInView: false, isInsideInView: false });
  });

  it("does not see a place beyond sight range", () => {
    const asciiWorld = buildAsciiWorld("a.....#####");
    const sighting = sightPlace(asciiWorld.world, requireMarker(asciiWorld, "a"), HUT, 3, false);
    expect(sighting.isInView).toBe(false);
  });

  it("ignores walls when only the inside is asked about", () => {
    const sighting = sightHut(
      `
      ......#####
      ......#...#
      .a....#...#
      ......#...#
      ......#####`,
      true,
    );
    expect(sighting).toEqual({ isInView: false, isInsideInView: false });
  });
});

describe("collapseEntityNames", () => {
  const bread = buildDefinition("bread");
  const knife = buildDefinition("knife", "knives");
  const tree = buildDefinition("tree");

  it("counts unlabelled things of one definition together", () => {
    const names = collapseEntityNames([
      { label: null, definition: bread },
      { label: null, definition: knife },
      { label: null, definition: bread },
      { label: null, definition: bread },
    ]);
    expect(names).toEqual(["3 bread", "a knife"]);
  });

  it("joins labels that differ only by a trailing number", () => {
    const names = collapseEntityNames([
      { label: "tree 1", definition: tree },
      { label: "oven", definition: buildDefinition("oven") },
      { label: "tree 2", definition: tree },
      { label: "tree", definition: tree },
      { label: "square bench 4", definition: buildDefinition("bench") },
    ]);
    expect(names).toEqual(["tree ×3", "oven", "square bench 4"]);
  });
});

describe("mergeSeenPlaces", () => {
  const bakery: SeenPlace = {
    name: "bakery",
    firstSeenTick: 3,
    entities: { tick: 3, names: ["oven", "2 bread"] },
  };

  it("adds a place seen from outside as not yet looked into", () => {
    const update = mergeSeenPlaces([], [{ name: "bakery", entityNames: null }], 7);
    expect(update.seenPlaces).toEqual([{ name: "bakery", firstSeenTick: 7, entities: null }]);
    expect(update.hasNewKnowledge).toBe(true);
  });

  it("replaces what a place holds with what is there now", () => {
    const update = mergeSeenPlaces([bakery], [{ name: "bakery", entityNames: ["oven"] }], 9);
    expect(update.seenPlaces).toEqual([
      { name: "bakery", firstSeenTick: 3, entities: { tick: 9, names: ["oven"] } },
    ]);
    expect(update.hasNewKnowledge).toBe(true);
  });

  it("keeps what was last seen while a place is out of view or seen only from outside", () => {
    expect(mergeSeenPlaces([bakery], [], 9).seenPlaces).toEqual([bakery]);
    const fromOutside = mergeSeenPlaces([bakery], [{ name: "bakery", entityNames: null }], 9);
    expect(fromOutside.seenPlaces).toEqual([bakery]);
    expect(fromOutside.hasNewKnowledge).toBe(false);
  });

  it("only moves the tick when the same things are seen again", () => {
    const update = mergeSeenPlaces(
      [bakery],
      [{ name: "bakery", entityNames: ["oven", "2 bread"] }],
      9,
    );
    expect(update.seenPlaces[0]?.entities?.tick).toBe(9);
    expect(update.hasNewKnowledge).toBe(false);
  });
});
