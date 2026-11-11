import { describe, expect, it } from "vitest";
import { findTileSourceRect, parseTiledMap } from "./tiled-map";

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
    tilesets: [{ firstgid: 1, name: "village", columns: 8, margin: 0, spacing: 0 }],
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

describe("findTileSourceRect", () => {
  const map = parseTiledMap(makeMapData(["ground"]), ["ground"], PLACES);

  it("skips empty cells", () => {
    expect(findTileSourceRect(map, 0)).toBeNull();
  });

  it("finds a tile's spot in the tileset grid", () => {
    expect(findTileSourceRect(map, 1)).toEqual({ x: 0, y: 0 });
    expect(findTileSourceRect(map, 10)).toEqual({ x: 16, y: 16 });
  });

  it("ignores Tiled's flip flags", () => {
    const horizontalFlipFlag = 0x80000000;
    expect(findTileSourceRect(map, (horizontalFlipFlag | 2) >>> 0)).toEqual({ x: 16, y: 0 });
  });
});
