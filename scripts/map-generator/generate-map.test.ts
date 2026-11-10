import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { config } from "../../server/src/config";
import { findPlaceAt, parseWorldMap } from "../../server/src/world/map-loader";
import { findPathToObject, findPathToPlace } from "../../server/src/world/pathfinding";
import { buildVillageLayout } from "./layout";
import { buildTiledMap, serializeTiledMap, type TiledObjectLayer } from "./tiled";
import { generateTilesetPng, TILE_NAMES, TILESET_COLUMNS } from "./tileset";

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
      expect(findPathToPlace(worldMap, start, place.name), place.name).not.toBeNull();
    }
    for (const object of worldMap.objects) {
      expect(findPathToObject(worldMap, start, object), object.name).not.toBeNull();
    }
  });

  it("gives every object a valid kind, its configured interactions and a matching place", () => {
    for (const object of worldMap.objects) {
      expect(object.interactions).toEqual(config.objects[object.kind].interactions);
      expect(findPlaceAt(worldMap, object.pos), object.name).toBe(object.place);
    }
    const names = worldMap.objects.map((object) => object.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts stock objects full and doors open", () => {
    const byName = new Map(worldMap.objects.map((object) => [object.name, object]));
    expect(byName.get("wheat field")?.state.stock).toBe(12);
    expect(byName.get("trees")?.state.stock).toBe(10);
    const doors = worldMap.objects.filter((object) => object.kind === "door");
    expect(doors.every((door) => door.state.isOpen === true)).toBe(true);
  });

  it("puts at least one door on every indoor place and two on the tavern", () => {
    const doors = worldMap.objects.filter((object) => object.kind === "door");
    for (const place of worldMap.places.filter((area) => area.isIndoor)) {
      const placeDoors = doors.filter((door) => door.place === place.name);
      expect(placeDoors.length, place.name).toBeGreaterThan(0);
      expect(placeDoors.every((door) => door.name.startsWith(place.name))).toBe(true);
    }
    expect(doors.filter((door) => door.place === "tavern")).toHaveLength(2);
    expect(doors.some((door) => door.name === "bakery door")).toBe(true);
  });

  it("gives each cottage a bed named after it and the tavern a spare bed", () => {
    const beds = worldMap.objects.filter((object) => object.kind === "bed");
    for (const placeName of EXPECTED_PLACES.filter((name) => name.endsWith("cottage"))) {
      expect(beds.find((bed) => bed.name === `${placeName} bed`)?.place).toBe(placeName);
    }
    expect(beds.find((bed) => bed.name === "spare bed")?.place).toBe("tavern");
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
    const png = generateTilesetPng();
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(TILESET_COLUMNS * config.map.tileSizePixels);
    expect(height).toBe(Math.ceil(TILE_NAMES.length / TILESET_COLUMNS) * config.map.tileSizePixels);
    const dataLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + dataLength));
    expect(pixels.length).toBe((width * 4 + 1) * height);
  });

  it("is generated deterministically", () => {
    expect(generateTilesetPng().equals(generateTilesetPng())).toBe(true);
  });
});
