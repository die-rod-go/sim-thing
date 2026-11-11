import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Position } from "@village/shared";
import { config } from "../config";
import type { MapPlacement, PlaceArea, WorldMap } from "./types";

const propertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const tiledObjectSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  properties: z.array(propertySchema).default([]),
});

const tileLayerSchema = z.looseObject({
  type: z.literal("tilelayer"),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  data: z.array(z.number().int().nonnegative()),
});

const objectLayerSchema = z.looseObject({
  type: z.literal("objectgroup"),
  name: z.string(),
  objects: z.array(tiledObjectSchema),
});

const otherLayerSchema = z.looseObject({ type: z.enum(["imagelayer", "group"]), name: z.string() });

const tiledMapSchema = z.looseObject({
  orientation: z.literal("orthogonal"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(z.union([tileLayerSchema, objectLayerSchema, otherLayerSchema])),
});

type TiledMapJson = z.infer<typeof tiledMapSchema>;
type TiledObjectJson = z.infer<typeof tiledObjectSchema>;

/** A map object names the item definition it places; `items.json` must have it as a placeable. */
const objectPropertiesSchema = z.object({
  name: z.string().min(1),
  definition: z.string().min(1),
  place: z.string().min(1),
});

function readProperties(object: TiledObjectJson): Record<string, unknown> {
  return Object.fromEntries(object.properties.map((property) => [property.name, property.value]));
}

function findTileLayer(tiledMap: TiledMapJson, name: string) {
  const layer = tiledMap.layers.find((candidate) => candidate.name === name);
  if (!layer || layer.type !== "tilelayer") throw new Error(`Map has no tile layer "${name}"`);
  const parsed = tileLayerSchema.parse(layer);
  if (parsed.data.length !== tiledMap.width * tiledMap.height) {
    throw new Error(`Tile layer "${name}" has ${parsed.data.length} tiles, expected a full grid`);
  }
  return parsed;
}

function findObjectLayer(tiledMap: TiledMapJson, name: string): TiledObjectJson[] {
  const layer = tiledMap.layers.find((candidate) => candidate.name === name);
  if (!layer || layer.type !== "objectgroup") throw new Error(`Map has no object layer "${name}"`);
  return objectLayerSchema.parse(layer).objects;
}

function buildPlace(object: TiledObjectJson, tileSize: number): PlaceArea {
  const isIndoor = z.boolean().default(false).parse(readProperties(object).isIndoor);
  return {
    name: object.name,
    isIndoor,
    x: Math.round(object.x / tileSize),
    y: Math.round(object.y / tileSize),
    width: Math.round(object.width / tileSize),
    height: Math.round(object.height / tileSize),
  };
}

function buildPlacement(object: TiledObjectJson, tileSize: number): MapPlacement {
  const properties = objectPropertiesSchema.parse(readProperties(object));
  return {
    label: properties.name,
    definitionId: properties.definition,
    place: properties.place,
    pos: { x: Math.floor(object.x / tileSize), y: Math.floor(object.y / tileSize) },
  };
}

function assertUnique(names: string[], what: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) throw new Error(`Duplicate ${what} "${name}" in map`);
    seen.add(name);
  }
}

/** Validates Tiled JSON and converts it into the world map the sim uses. */
export function parseWorldMap(json: unknown): WorldMap {
  const tiledMap = tiledMapSchema.parse(json);
  const tileSize = tiledMap.tilewidth;
  const walls = findTileLayer(tiledMap, "walls");
  findTileLayer(tiledMap, "ground");

  const places = findObjectLayer(tiledMap, "places").map((object) => buildPlace(object, tileSize));
  const placements = findObjectLayer(tiledMap, "objects").map((object) =>
    buildPlacement(object, tileSize),
  );
  assertUnique(
    places.map((place) => place.name),
    "place",
  );
  assertUnique(
    placements.map((placement) => placement.label.toLowerCase()),
    "object",
  );

  const spawnPoints: Record<string, Position> = {};
  for (const spawn of findObjectLayer(tiledMap, "spawns")) {
    spawnPoints[spawn.name] = {
      x: Math.floor(spawn.x / tileSize),
      y: Math.floor(spawn.y / tileSize),
    };
  }

  return {
    grid: {
      width: tiledMap.width,
      height: tiledMap.height,
      isWall: walls.data.map((gid) => gid !== 0),
    },
    places,
    placements,
    spawnPoints,
  };
}

export function loadWorldMap(filePath: string): WorldMap {
  const text = readFileSync(filePath, "utf8");
  try {
    return parseWorldMap(JSON.parse(text));
  } catch (error) {
    throw new Error(`Could not load map ${filePath}`, { cause: error });
  }
}

export function findPlaceAt(map: WorldMap, position: Position): string {
  const place = map.places.find(
    (area) =>
      position.x >= area.x &&
      position.y >= area.y &&
      position.x < area.x + area.width &&
      position.y < area.y + area.height,
  );
  return place?.name ?? config.map.defaultOutdoorPlace;
}
