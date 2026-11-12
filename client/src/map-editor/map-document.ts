import {
  MAP_LAYER_NAMES,
  MAP_TILE_LAYER_NAMES,
  type Glyph,
  type MapTileLayerName,
  type Position,
} from "@village/shared";
import { parseTiledMap } from "../village/tiled-map";

/** A tile of the map's tileset, as the palette shows it. */
export interface TileType {
  gid: number;
  name: string;
  glyph: Glyph | null;
}

/** A named rectangle of the map, in tiles. `id` is its Tiled object id. */
export interface PlaceDraft {
  id: number;
  name: string;
  isIndoor: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An item the map places: which definition, the name it goes by, and its tile. */
export interface ItemDraft {
  id: number;
  label: string;
  definitionId: string;
  x: number;
  y: number;
}

/** Where one character starts, by seed agent id. */
export interface StartDraft {
  id: number;
  agentId: string;
  x: number;
  y: number;
}

export type TileLayers = Record<MapTileLayerName, number[]>;

/** The map as the editor changes it. Everything else in the Tiled file is kept from `source`. */
export interface MapDocument {
  width: number;
  height: number;
  tileSize: number;
  tileLayers: TileLayers;
  places: PlaceDraft[];
  items: ItemDraft[];
  starts: StartDraft[];
  nextObjectId: number;
  source: Record<string, unknown>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

function readProperties(object: JsonRecord): JsonRecord {
  const { properties } = object;
  if (!Array.isArray(properties)) return {};
  return Object.fromEntries(
    properties.filter(isRecord).map((property) => [String(property.name), property.value]),
  );
}

function listLayers(source: JsonRecord): JsonRecord[] {
  return Array.isArray(source.layers) ? source.layers.filter(isRecord) : [];
}

function findLayer(source: JsonRecord, name: string): JsonRecord | undefined {
  return listLayers(source).find((layer) => layer.name === name);
}

function listLayerObjects(source: JsonRecord, name: string): JsonRecord[] {
  const objects = findLayer(source, name)?.objects;
  return Array.isArray(objects) ? objects.filter(isRecord) : [];
}

function readTileLayer(source: JsonRecord, name: string, cellCount: number): number[] {
  const data = findLayer(source, name)?.data;
  if (!Array.isArray(data)) return new Array<number>(cellCount).fill(0);
  if (data.length !== cellCount || !data.every((gid) => typeof gid === "number")) {
    throw new Error(`Tile layer "${name}" doesn't have one number per tile`);
  }
  return data;
}

/** The palette: every tile of the map's tileset, with its glyph and its Tiled type as a name. */
export function listTileTypes(json: unknown): TileType[] {
  const tiledMap = parseTiledMap(json, [MAP_LAYER_NAMES.ground], MAP_LAYER_NAMES.places);
  const { firstGid, glyphsByTileId, terrainsByTileId } = tiledMap.tileset;
  const tileIds = [...new Set([...glyphsByTileId.keys(), ...terrainsByTileId.keys()])].sort(
    (first, second) => first - second,
  );
  return tileIds.map((tileId) => ({
    gid: firstGid + tileId,
    name: (terrainsByTileId.get(tileId) ?? `tile ${tileId}`).replaceAll("_", " "),
    glyph: glyphsByTileId.get(tileId) ?? null,
  }));
}

/** Reads the Tiled JSON the server sent into an editable map; throws a readable error if it can't. */
export function parseMapDocument(json: unknown): MapDocument {
  if (!isRecord(json)) throw new Error("The map file is not a JSON object");
  const width = readNumber(json, "width");
  const height = readNumber(json, "height");
  const tileSize = readNumber(json, "tilewidth");
  if (width < 1 || height < 1 || tileSize < 1) {
    throw new Error("The map file has no width, height or tile size");
  }
  const cellCount = width * height;
  const toTile = (pixels: number) => Math.floor(pixels / tileSize);
  const tileLayers = Object.fromEntries(
    MAP_TILE_LAYER_NAMES.map((name) => [name, readTileLayer(json, name, cellCount)]),
  ) as TileLayers;
  const places = listLayerObjects(json, MAP_LAYER_NAMES.places).map((object) => ({
    id: readNumber(object, "id"),
    name: String(object.name ?? ""),
    isIndoor: readProperties(object).isIndoor === true,
    x: Math.round(readNumber(object, "x") / tileSize),
    y: Math.round(readNumber(object, "y") / tileSize),
    width: Math.round(readNumber(object, "width") / tileSize),
    height: Math.round(readNumber(object, "height") / tileSize),
  }));
  const items = listLayerObjects(json, MAP_LAYER_NAMES.objects).map((object) => {
    const properties = readProperties(object);
    return {
      id: readNumber(object, "id"),
      label: String(properties.name ?? object.name ?? ""),
      definitionId: String(properties.definition ?? ""),
      x: toTile(readNumber(object, "x")),
      y: toTile(readNumber(object, "y")),
    };
  });
  const starts = listLayerObjects(json, MAP_LAYER_NAMES.starts).map((object) => ({
    id: readNumber(object, "id"),
    agentId: String(object.name ?? ""),
    x: toTile(readNumber(object, "x")),
    y: toTile(readNumber(object, "y")),
  }));
  const highestObjectId = Math.max(
    0,
    ...[...places, ...items, ...starts].map((object) => object.id),
  );
  return {
    width,
    height,
    tileSize,
    tileLayers,
    places,
    items,
    starts,
    nextObjectId: Math.max(readNumber(json, "nextobjectid"), highestObjectId + 1),
    source: json,
  };
}

function buildPlaceObject(place: PlaceDraft, tileSize: number): JsonRecord {
  return {
    id: place.id,
    name: place.name.trim(),
    type: "",
    rotation: 0,
    visible: true,
    x: place.x * tileSize,
    y: place.y * tileSize,
    width: place.width * tileSize,
    height: place.height * tileSize,
    properties: [{ name: "isIndoor", type: "bool", value: place.isIndoor }],
  };
}

function buildItemObject(item: ItemDraft, tileSize: number): JsonRecord {
  return {
    id: item.id,
    name: item.label.trim(),
    type: "",
    rotation: 0,
    visible: true,
    x: item.x * tileSize,
    y: item.y * tileSize,
    width: tileSize,
    height: tileSize,
    properties: [
      { name: "name", type: "string", value: item.label.trim() },
      { name: "definition", type: "string", value: item.definitionId },
    ],
  };
}

function buildStartObject(start: StartDraft, tileSize: number): JsonRecord {
  const halfTile = tileSize / 2;
  return {
    id: start.id,
    name: start.agentId,
    type: "",
    rotation: 0,
    visible: true,
    x: start.x * tileSize + halfTile,
    y: start.y * tileSize + halfTile,
    width: 0,
    height: 0,
    point: true,
  };
}

function buildLayerContents(document: MapDocument, name: string): JsonRecord | null {
  const { tileSize } = document;
  if ((MAP_TILE_LAYER_NAMES as readonly string[]).includes(name)) {
    return {
      type: "tilelayer",
      width: document.width,
      height: document.height,
      data: document.tileLayers[name as MapTileLayerName],
    };
  }
  if (name === MAP_LAYER_NAMES.places) {
    return { objects: document.places.map((place) => buildPlaceObject(place, tileSize)) };
  }
  if (name === MAP_LAYER_NAMES.objects) {
    return { objects: document.items.map((item) => buildItemObject(item, tileSize)) };
  }
  if (name === MAP_LAYER_NAMES.starts) {
    return { objects: document.starts.map((start) => buildStartObject(start, tileSize)) };
  }
  return null;
}

const LAYER_ORDER = [
  ...MAP_TILE_LAYER_NAMES,
  MAP_LAYER_NAMES.places,
  MAP_LAYER_NAMES.objects,
  MAP_LAYER_NAMES.starts,
];

/** A layer the source file lacks, made the way Tiled would. */
function buildMissingLayer(name: string, layerId: number): JsonRecord {
  const isTileLayer = (MAP_TILE_LAYER_NAMES as readonly string[]).includes(name);
  return {
    id: layerId,
    name,
    type: isTileLayer ? "tilelayer" : "objectgroup",
    ...(isTileLayer ? {} : { draworder: "topdown" }),
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
  };
}

/** The Tiled JSON to save: the source file with the editor's size, layers and objects. */
export function serializeMapDocument(document: MapDocument): JsonRecord {
  const { source } = document;
  const sourceLayers = listLayers(source);
  let nextLayerId = Math.max(
    readNumber(source, "nextlayerid"),
    ...sourceLayers.map((layer) => readNumber(layer, "id") + 1),
  );
  const missingLayers = LAYER_ORDER.filter(
    (name) => !sourceLayers.some((layer) => layer.name === name),
  ).map((name) => buildMissingLayer(name, nextLayerId++));
  const layers = [...sourceLayers, ...missingLayers].map((layer) => ({
    ...layer,
    ...buildLayerContents(document, String(layer.name)),
  }));
  return {
    ...source,
    width: document.width,
    height: document.height,
    nextlayerid: nextLayerId,
    nextobjectid: document.nextObjectId,
    layers,
  };
}

export function isInsideMap(document: MapDocument, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < document.width &&
    position.y < document.height
  );
}

export function findCellIndex(document: MapDocument, position: Position): number {
  return position.y * document.width + position.x;
}
