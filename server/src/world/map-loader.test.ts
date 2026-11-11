import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { findPlaceAt, loadWorldMap, parseWorldMap } from "./map-loader";
import { tileIndex } from "./types";

const mapPath = resolve(import.meta.dirname, "../../../maps/village.json");

function buildTinyTiledMap(objectProperties: { name: string; type: string; value: unknown }[]) {
  const width = 4;
  const height = 3;
  const walls = new Array<number>(width * height).fill(0);
  walls[1] = 5;
  return {
    orientation: "orthogonal",
    width,
    height,
    tilewidth: 16,
    tileheight: 16,
    layers: [
      { type: "tilelayer", name: "ground", width, height, data: new Array(width * height).fill(1) },
      { type: "tilelayer", name: "walls", width, height, data: walls },
      {
        type: "objectgroup",
        name: "places",
        objects: [
          {
            id: 1,
            name: "shed",
            x: 32,
            y: 0,
            width: 32,
            height: 32,
            properties: [{ name: "isIndoor", type: "bool", value: true }],
          },
        ],
      },
      {
        type: "objectgroup",
        name: "objects",
        objects: [
          { id: 2, name: "", x: 48, y: 16, width: 16, height: 16, properties: objectProperties },
        ],
      },
      {
        type: "objectgroup",
        name: "spawns",
        objects: [{ id: 3, name: "shed", x: 40, y: 8, point: true }],
      },
    ],
  };
}

const benchProperties = [
  { name: "name", type: "string", value: "Old Bench" },
  { name: "definition", type: "string", value: "bench" },
  { name: "place", type: "string", value: "shed" },
];

describe("parseWorldMap", () => {
  it("reads walls, places, objects and spawn tiles from Tiled JSON", () => {
    const map = parseWorldMap(buildTinyTiledMap(benchProperties));
    expect(map.grid.isWall[tileIndex(map.grid, { x: 1, y: 0 })]).toBe(true);
    expect(map.grid.isWall[tileIndex(map.grid, { x: 0, y: 0 })]).toBe(false);
    expect(map.places).toEqual([{ name: "shed", isIndoor: true, x: 2, y: 0, width: 2, height: 2 }]);
    expect(map.placements).toEqual([
      { label: "Old Bench", definitionId: "bench", place: "shed", pos: { x: 3, y: 1 } },
    ]);
    expect(map.spawnPoints).toEqual({ shed: { x: 2, y: 0 } });
  });

  it("rejects an object that names no item definition", () => {
    const properties = benchProperties.filter((property) => property.name !== "definition");
    expect(() => parseWorldMap(buildTinyTiledMap(properties))).toThrow();
  });

  it("rejects a map without a walls layer", () => {
    const tiledMap = buildTinyTiledMap(benchProperties);
    tiledMap.layers = tiledMap.layers.filter((layer) => layer.name !== "walls");
    expect(() => parseWorldMap(tiledMap)).toThrow(/walls/);
  });
});

describe("findPlaceAt", () => {
  const map = loadWorldMap(mapPath);

  it("names the place whose area holds the tile", () => {
    const bed = map.placements.find((placement) => placement.label === "rose cottage bed");
    expect(bed && findPlaceAt(map, bed.pos)).toBe("rose cottage");
    expect(findPlaceAt(map, map.spawnPoints["tavern"] ?? { x: -1, y: -1 })).toBe("tavern");
  });

  it("falls back to the village road outside every place", () => {
    expect(findPlaceAt(map, { x: 1, y: 8 })).toBe(config.map.defaultOutdoorPlace);
  });

  it("counts a doorway as part of its building", () => {
    const door = map.placements.find((placement) => placement.label === "bakery door");
    expect(door && findPlaceAt(map, door.pos)).toBe("bakery");
  });
});
