import { describe, expect, it } from "vitest";
import { findMapProblems, hasMapErrors, type MapLayout, type MapReferences } from "./map-file";

const references: MapReferences = {
  placeableItems: [{ id: "bed", name: "bed", glyph: { index: 233, color: "#ffffff" } }],
  characters: [{ id: "mara", name: "Mara" }],
};

function buildLayout(overrides: Partial<MapLayout> = {}): MapLayout {
  const width = 4;
  const height = 3;
  const isWall = new Array<boolean>(width * height).fill(false);
  isWall[0] = true;
  return {
    width,
    height,
    isWall,
    places: [{ name: "shed", x: 1, y: 0, width: 2, height: 2 }],
    placements: [{ label: "shed bed", definitionId: "bed", pos: { x: 1, y: 1 } }],
    startTiles: { mara: { x: 2, y: 1 } },
    ...overrides,
  };
}

function listMessages(layout: MapLayout): string[] {
  return findMapProblems(layout, references).map((problem) => problem.message);
}

describe("findMapProblems", () => {
  it("finds nothing wrong with a tidy map", () => {
    expect(findMapProblems(buildLayout(), references)).toEqual([]);
  });

  it("refuses a character with no start tile", () => {
    const problems = findMapProblems(buildLayout({ startTiles: {} }), references);
    expect(hasMapErrors(problems)).toBe(true);
    expect(problems[0]?.message).toMatch(/Mara has no start tile/);
  });

  it("only warns about a start tile for someone not in the seed file", () => {
    const layout = buildLayout({ startTiles: { mara: { x: 2, y: 1 }, ghost: { x: 3, y: 2 } } });
    const problems = findMapProblems(layout, references);
    expect(hasMapErrors(problems)).toBe(false);
    expect(problems[0]?.message).toMatch(/ghost/);
  });

  it("warns about a start tile on a wall", () => {
    const problems = findMapProblems(
      buildLayout({ startTiles: { mara: { x: 0, y: 0 } } }),
      references,
    );
    expect(problems).toEqual([{ severity: "warning", message: expect.stringMatching(/wall/) }]);
  });

  it("refuses duplicate place names and places past the edge", () => {
    const places = [
      { name: "shed", x: 1, y: 0, width: 2, height: 2 },
      { name: "shed", x: 3, y: 2, width: 2, height: 2 },
    ];
    expect(listMessages(buildLayout({ places }))).toEqual([
      'Two places are called "shed".',
      'Place "shed" reaches past the edge of the map.',
    ]);
  });

  it("warns that the first of two overlapping places owns the shared tiles", () => {
    const places = [
      { name: "shed", x: 1, y: 0, width: 2, height: 2 },
      { name: "yard", x: 2, y: 1, width: 2, height: 2 },
    ];
    const problems = findMapProblems(buildLayout({ places }), references);
    expect(problems).toEqual([
      { severity: "warning", message: expect.stringMatching(/belong to "shed"/) },
    ]);
  });

  it("refuses items with an unknown definition or a name used twice, ignoring case", () => {
    const placements = [
      { label: "Old Bed", definitionId: "bed", pos: { x: 1, y: 1 } },
      { label: "old bed", definitionId: "bed", pos: { x: 2, y: 1 } },
      { label: "throne", definitionId: "throne", pos: { x: 3, y: 1 } },
    ];
    expect(listMessages(buildLayout({ placements }))).toEqual([
      'Two items are called "old bed".',
      '"throne" is a "throne", which items.json doesn\'t define.',
    ]);
  });
});
