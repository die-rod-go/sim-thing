import { describe, expect, it } from "vitest";
import type { MapDocument } from "../../src/map-editor/map-document";
import {
  addItem,
  addPlace,
  buildMapLayout,
  fillRectangle,
  floodFill,
  listLineTiles,
  listLostByResize,
  paintTiles,
  resizeMap,
  setStart,
  spanTiles,
} from "../../src/map-editor/map-edits";
import {
  findSelectionAt,
  isPlaceResizeHandle,
  moveSelection,
  resizePlaceToCorner,
} from "../../src/map-editor/map-selection";

const GRASS = 1;
const STONE = 2;
const WALL = 5;

/** A 4×3 map of grass, with a wall in the top-left corner. */
function buildDocument(): MapDocument {
  const cellCount = 12;
  const walls = new Array<number>(cellCount).fill(0);
  walls[0] = WALL;
  return {
    width: 4,
    height: 3,
    tileSize: 16,
    tileLayers: {
      ground: new Array<number>(cellCount).fill(GRASS),
      walls,
      decor: new Array<number>(cellCount).fill(0),
    },
    places: [{ id: 1, name: "shed", isIndoor: true, x: 1, y: 0, width: 2, height: 2 }],
    items: [{ id: 2, label: "shed bed", definitionId: "bed", x: 1, y: 1 }],
    starts: [{ id: 3, agentId: "mara", x: 2, y: 1 }],
    nextObjectId: 4,
    source: {},
  };
}

describe("painting tiles", () => {
  it("paints a gapless line between two dragged-over tiles", () => {
    expect(listLineTiles({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it("returns the same map when painting changes nothing", () => {
    const document = buildDocument();
    expect(paintTiles(document, "ground", [{ x: 0, y: 0 }], GRASS)).toBe(document);
    expect(paintTiles(document, "ground", [{ x: 9, y: 9 }], STONE)).toBe(document);
  });

  it("fills a rectangle spanned from either corner", () => {
    const filled = fillRectangle(
      buildDocument(),
      "ground",
      spanTiles({ x: 2, y: 1 }, { x: 1, y: 0 }),
      STONE,
    );
    expect(filled.tileLayers.ground).toEqual([1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it("flood fills only the connected run of the same tile", () => {
    const divided = paintTiles(
      buildDocument(),
      "ground",
      [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      STONE,
    );
    const filled = floodFill(divided, "ground", { x: 0, y: 0 }, WALL);
    expect(filled.tileLayers.ground).toEqual([5, 5, 2, 1, 5, 5, 2, 1, 5, 5, 2, 1]);
  });
});

describe("resizeMap", () => {
  it("grows from the bottom-right, filling new ground with the chosen tile", () => {
    const grown = resizeMap(buildDocument(), 5, 3, STONE);
    expect(grown.tileLayers.ground.slice(0, 5)).toEqual([1, 1, 1, 1, 2]);
    expect(grown.tileLayers.walls.slice(0, 5)).toEqual([5, 0, 0, 0, 0]);
  });

  it("clips places and drops items and start tiles left outside", () => {
    const document = buildDocument();
    expect(listLostByResize(document, 1, 3)).toEqual([
      'place "shed"',
      '"shed bed"',
      "mara's start tile",
    ]);
    const shrunk = resizeMap(document, 2, 3, GRASS);
    expect(shrunk.places).toEqual([expect.objectContaining({ x: 1, width: 1, height: 2 })]);
    expect(shrunk.items).toHaveLength(1);
    expect(shrunk.starts).toEqual([]);
    expect(shrunk.tileLayers.ground).toHaveLength(6);
  });
});

describe("adding places, items and start tiles", () => {
  it("names a new place so it doesn't clash, and clips it to the map", () => {
    const first = addPlace(buildDocument(), { x: 3, y: 2, width: 4, height: 4 }, "shed");
    expect(first.document.places.at(-1)).toMatchObject({
      id: 4,
      name: "shed 2",
      width: 1,
      height: 1,
    });
    expect(first.document.nextObjectId).toBe(5);
  });

  it("numbers a new item's name when the plain one is taken, ignoring case", () => {
    const added = addItem(buildDocument(), "bed", "Shed Bed", { x: 3, y: 2 });
    expect(added.document.items.at(-1)?.label).toBe("Shed Bed 2");
  });

  it("moves a character's start tile instead of giving them a second one", () => {
    const moved = setStart(buildDocument(), "mara", { x: 3, y: 2 });
    expect(moved.starts).toEqual([{ id: 3, agentId: "mara", x: 3, y: 2 }]);
    const added = setStart(moved, "ilsa", { x: 0, y: 2 });
    expect(added.starts.map((start) => start.agentId)).toEqual(["mara", "ilsa"]);
  });

  it("checks the walls layer as walls", () => {
    expect(buildMapLayout(buildDocument()).isWall.slice(0, 2)).toEqual([true, false]);
  });
});

describe("selecting and moving", () => {
  it("picks a start tile over an item over a place on the same tile", () => {
    const document = setStart(buildDocument(), "mara", { x: 1, y: 1 });
    expect(findSelectionAt(document, { x: 1, y: 1 })).toEqual({ kind: "start", agentId: "mara" });
    expect(findSelectionAt(buildDocument(), { x: 1, y: 1 })).toEqual({ kind: "item", id: 2 });
    expect(findSelectionAt(buildDocument(), { x: 1, y: 0 })).toEqual({ kind: "place", id: 1 });
    expect(findSelectionAt(buildDocument(), { x: 0, y: 2 })).toBeNull();
  });

  it("keeps a moved place wholly on the map", () => {
    const moved = moveSelection(buildDocument(), { kind: "place", id: 1 }, { x: 5, y: 5 });
    expect(moved.places[0]).toMatchObject({ x: 2, y: 1 });
  });

  it("resizes a place from its bottom-right corner, never below one tile", () => {
    const place = buildDocument().places[0]!;
    expect(isPlaceResizeHandle(place, { x: 2, y: 1 })).toBe(true);
    expect(isPlaceResizeHandle(place, { x: 1, y: 1 })).toBe(false);
    const shrunk = resizePlaceToCorner(buildDocument(), 1, { x: 0, y: 0 });
    expect(shrunk.places[0]).toMatchObject({ width: 1, height: 1 });
    const grown = resizePlaceToCorner(buildDocument(), 1, { x: 9, y: 9 });
    expect(grown.places[0]).toMatchObject({ width: 3, height: 3 });
  });
});
