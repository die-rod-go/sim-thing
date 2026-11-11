import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { buildItemCatalog, GLYPH_SHEET, parseItemFile } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../../server/src/config";
import { findPlaceAt, parseWorldMap } from "../../server/src/world/map-loader";
import { findPathToPlace, findPathToTile } from "../../server/src/world/pathfinding";
import { buildVillageLayout } from "./layout";
import { decodePng } from "./png-decode";
import { buildTiledMap, serializeTiledMap, type TiledObjectLayer } from "./tiled";
import { generateTilesetPng, TILE_GLYPHS, TILE_NAMES, TILESET_COLUMNS } from "./tileset";

const EXPECTED_PLACES = [
  "town square",
  "farm",
  "woodlot",
  "bakery",
  "tavern",
  "rose cottage",
  "ivy cottage",
  "stone cottage",
  "willow cottage",
  "hill cottage",
];

const tiledMap = buildTiledMap(buildVillageLayout());
const worldMap = parseWorldMap(tiledMap);
const items = buildItemCatalog(
  parseItemFile(
    JSON.parse(readFileSync(resolve(import.meta.dirname, "../../seeds/items.json"), "utf8")),
  ),
);
const glyphSheet = decodePng(
  readFileSync(resolve(import.meta.dirname, "../../maps", GLYPH_SHEET.fileName)),
);
const doors = worldMap.placements.filter((placement) => placement.definitionId === "door");

function objectLayer(name: string): TiledObjectLayer {
  const layer = tiledMap.layers.find((candidate) => candidate.name === name);
  if (!layer || layer.type !== "objectgroup") throw new Error(`missing layer ${name}`);
  return layer;
}

describe("generated village map", () => {
  it("is a 40x30 orthogonal map of 16px tiles with the agreed layers", () => {
    expect(tiledMap.width).toBe(config.map.widthTiles);
    expect(tiledMap.height).toBe(config.map.heightTiles);
    expect(tiledMap.tilewidth).toBe(config.map.tileSizePixels);
    expect(tiledMap.orientation).toBe("orthogonal");
    expect(tiledMap.layers.map((layer) => layer.name)).toEqual([
      "ground",
      "walls",
      "decor",
      "places",
      "objects",
      "spawns",
    ]);
    expect(tiledMap.tilesets[0]).toMatchObject({ image: "tileset.png", firstgid: 1 });
  });

  it("contains every v1 place with a spawn point inside it", () => {
    expect(worldMap.places.map((place) => place.name).sort()).toEqual([...EXPECTED_PLACES].sort());
    for (const placeName of EXPECTED_PLACES) {
      const spawn = worldMap.spawnPoints[placeName];
      expect(spawn, placeName).toBeDefined();
      if (spawn) expect(findPlaceAt(worldMap, spawn)).toBe(placeName);
    }
  });

  it("can reach every place and every object from the town square", () => {
    const start = worldMap.spawnPoints["town square"];
    if (!start) throw new Error("no town square spawn");
    for (const place of worldMap.places) {
      expect(
        findPathToPlace(worldMap, worldMap.grid, start, place.name),
        place.name,
      ).not.toBeNull();
    }
    for (const placement of worldMap.placements) {
      const path = findPathToTile(worldMap.grid, start, placement.pos);
      expect(path, placement.label).not.toBeNull();
    }
  });

  it("names an item definition other than the agents' body and a matching place for every object", () => {
    for (const placement of worldMap.placements) {
      const definition = items.definitionsById.get(placement.definitionId);
      expect(definition, placement.label).toBeDefined();
      expect(placement.definitionId, placement.label).not.toBe(items.world.agentBody);
      expect(findPlaceAt(worldMap, placement.pos), placement.label).toBe(placement.place);
    }
    const labels = worldMap.placements.map((placement) => placement.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("doesn't bake placed objects into the decor layer", () => {
    const decor = tiledMap.layers.find((layer) => layer.name === "decor");
    if (!decor || decor.type !== "tilelayer") throw new Error("missing decor layer");
    for (const placement of worldMap.placements) {
      const index = placement.pos.y * tiledMap.width + placement.pos.x;
      expect(decor.data[index], placement.label).toBe(0);
    }
  });

  it("puts at least one door on every indoor place and two on the tavern", () => {
    for (const place of worldMap.places.filter((area) => area.isIndoor)) {
      const placeDoors = doors.filter((door) => door.place === place.name);
      expect(placeDoors.length, place.name).toBeGreaterThan(0);
      expect(placeDoors.every((door) => door.label.startsWith(place.name))).toBe(true);
    }
    expect(doors.filter((door) => door.place === "tavern")).toHaveLength(2);
    expect(doors.some((door) => door.label === "bakery door")).toBe(true);
  });

  it("gives each cottage a bed named after it and the tavern a spare bed", () => {
    const beds = worldMap.placements.filter((placement) => placement.definitionId === "bed");
    for (const placeName of EXPECTED_PLACES.filter((name) => name.endsWith("cottage"))) {
      expect(beds.find((bed) => bed.label === `${placeName} bed`)?.place).toBe(placeName);
    }
    expect(beds.find((bed) => bed.label === "spare bed")?.place).toBe("tavern");
  });

  it("puts interactable objects on the tile's top-left corner in pixels", () => {
    for (const object of objectLayer("objects").objects) {
      expect(object.x % config.map.tileSizePixels).toBe(0);
      expect(object.y % config.map.tileSizePixels).toBe(0);
    }
  });

  it("matches the committed maps/village.json", () => {
    const committed = readFileSync(resolve(import.meta.dirname, "../../maps/village.json"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(serializeTiledMap(tiledMap));
  });
});

describe("generated tileset", () => {
  it("is a valid RGBA PNG holding every tile", () => {
    const png = generateTilesetPng(glyphSheet);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(TILESET_COLUMNS * config.map.tileSizePixels);
    expect(height).toBe(Math.ceil(TILE_NAMES.length / TILESET_COLUMNS) * config.map.tileSizePixels);
    const dataLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + dataLength));
    expect(pixels.length).toBe((width * 4 + 1) * height);
  });

  it("paints each tile's glyph in its color over its background", () => {
    const tileset = decodePng(generateTilesetPng(glyphSheet));
    const waterTileId = TILE_NAMES.indexOf("water");
    const tileSize = config.map.tileSizePixels;
    const tileLeft = (waterTileId % TILESET_COLUMNS) * tileSize;
    const tileTop = Math.floor(waterTileId / TILESET_COLUMNS) * tileSize;
    const tilePixelColors = new Set<string>();
    for (let row = 0; row < tileSize; row++) {
      for (let column = 0; column < tileSize; column++) {
        const offset = ((tileTop + row) * tileset.width + tileLeft + column) * 4;
        const [red, green, blue] = tileset.pixels.subarray(offset, offset + 3);
        const toHex = (channel: number | undefined) => (channel ?? 0).toString(16).padStart(2, "0");
        tilePixelColors.add(`#${toHex(red)}${toHex(green)}${toHex(blue)}`);
      }
    }
    expect([...tilePixelColors].sort()).toEqual(
      [TILE_GLYPHS.water.background, TILE_GLYPHS.water.color].sort(),
    );
  });

  it("is generated deterministically", () => {
    expect(generateTilesetPng(glyphSheet).equals(generateTilesetPng(glyphSheet))).toBe(true);
  });
});
