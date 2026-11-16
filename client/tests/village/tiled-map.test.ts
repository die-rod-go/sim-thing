import { describe, expect, it } from "vitest";
import { findTileGlyph, listTileTerrains, parseTiledMap } from "../../src/village/tiled-map";

const PLACES = "places";

function makeMapData(layerNames: string[]) {
  return {
    width: 2,
    height: 1,
    tilewidth: 16,
    tileheight: 16,
    layers: [
      ...layerNames.map((name) => ({ type: "tilelayer", name, data: [1, 0] })),
      { type: "objectgroup", name: "objects" },
      {
        type: "objectgroup",
        name: PLACES,
        objects: [{ name: "bakery", x: 16, y: 32, width: 48, height: 64 }, { name: "" }],
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: "village",
        tiles: [
          {
            id: 0,
            type: "grass",
            properties: [
              { name: "collides", type: "bool", value: false },
              { name: "glyph", type: "int", value: 44 },
              { name: "color", type: "string", value: "#5f9e4c" },
              { name: "background", type: "string", value: "#2c4f26" },
            ],
          },
        ],
      },
    ],
  };
}

describe("parseTiledMap", () => {
  it("keeps tile layers and names missing ones", () => {
    expect(() => parseTiledMap(makeMapData(["ground"]), ["ground", "walls"], PLACES)).toThrow(
      /walls/,
    );
    const map = parseTiledMap(makeMapData(["ground"]), ["ground"], PLACES);
    expect(map.tileLayers.map((layer) => layer.name)).toEqual(["ground"]);
    expect(map.tileLayers[0]?.gids).toEqual([1, 0]);
  });

  it("reads named place rectangles from the places layer", () => {
    const map = parseTiledMap(makeMapData(["ground"]), ["ground"], PLACES);
    expect(map.places).toEqual([{ name: "bakery", x: 16, y: 32, width: 48, height: 64 }]);
  });

  it("rejects a map file that is not JSON map data", () => {
    expect(() => parseTiledMap("<html>", ["ground"], PLACES)).toThrow(/missing/);
  });
});

describe("findTileGlyph", () => {
  const grassGlyph = { index: 44, color: "#5f9e4c", background: "#2c4f26" };

  it("rejects a tile whose glyph has no color", () => {
    const mapData = makeMapData(["ground"]);
    mapData.tilesets[0]?.tiles.push({
      id: 1,
      type: "",
      properties: [{ name: "glyph", type: "int", value: 35 }],
    });
    expect(() => parseTiledMap(mapData, ["ground"], PLACES)).toThrow(/tile 1 has a bad glyph/);
  });

  describe("with valid glyphs", () => {
    const map = parseTiledMap(makeMapData(["ground"]), ["ground"], PLACES);

    it("skips empty cells and tiles without a glyph", () => {
      expect(findTileGlyph(map, 0)).toBeNull();
      expect(findTileGlyph(map, 2)).toBeNull();
    });

    it("reads a tile's glyph from its properties", () => {
      expect(findTileGlyph(map, 1)).toEqual(grassGlyph);
    });

    it("ignores Tiled's flip flags", () => {
      const horizontalFlipFlag = 0x80000000;
      expect(findTileGlyph(map, (horizontalFlipFlag | 1) >>> 0)).toEqual(grassGlyph);
    });
  });
});

describe("listTileTerrains", () => {
  it("names a cell's terrain from the top layer down, skipping empty cells", () => {
    const mapData = makeMapData(["ground", "walls"]);
    mapData.tilesets[0]?.tiles.push({ id: 1, type: "wall", properties: [] });
    const wallsLayer = mapData.layers[1];
    if (wallsLayer && "data" in wallsLayer) wallsLayer.data = [2, 0];
    const map = parseTiledMap(mapData, ["ground", "walls"], PLACES);
    expect(listTileTerrains(map, { x: 0, y: 0 })).toEqual(["wall", "grass"]);
    expect(listTileTerrains(map, { x: 1, y: 0 })).toEqual([]);
  });
});
