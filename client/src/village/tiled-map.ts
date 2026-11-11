import { glyphSchema, type Glyph } from "@village/shared";

/** The parts of a Tiled map the village view draws: size, one tileset, tile layers and places. */
export interface TiledMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tileset: TiledTileset;
  tileLayers: TiledTileLayer[];
  places: TiledPlace[];
}

/** A named area of the map, in map pixels. */
export interface TiledPlace {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TiledTileset {
  firstGid: number;
  /** Each tile's glyph, by its id within the tileset; tiles without one aren't drawn. */
  glyphsByTileId: ReadonlyMap<number, Glyph>;
}

export interface TiledTileLayer {
  name: string;
  opacity: number;
  isVisible: boolean;
  /** Global tile ids, row by row; 0 means no tile. */
  gids: number[];
}

/** Tiled stores flip and rotation flags in the top bits of each gid. */
const GID_FLAG_BITS_MASK = 0x1fffffff;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" ? value : fallback;
}

function readTileProperties(tile: Record<string, unknown>): Record<string, unknown> {
  const { properties } = tile;
  if (!Array.isArray(properties)) return {};
  return Object.fromEntries(
    properties
      .filter((property): property is Record<string, unknown> => isRecord(property))
      .map((property) => [String(property.name), property.value]),
  );
}

/** A tile's glyph from its `glyph`, `color` and `background` properties. */
function parseTileGlyph(tile: Record<string, unknown>): [number, Glyph] | null {
  const { glyph, color, background } = readTileProperties(tile);
  if (glyph === undefined || typeof tile.id !== "number") return null;
  const parsed = glyphSchema.safeParse({ index: glyph, color, background });
  if (!parsed.success) {
    throw new Error(`Tileset tile ${tile.id} has a bad glyph: ${parsed.error.message}`);
  }
  return [tile.id, parsed.data];
}

function parseTileset(tilesets: unknown[]): TiledTileset {
  const firstTileset: unknown = tilesets[0];
  if (!isRecord(firstTileset) || !Array.isArray(firstTileset.tiles)) {
    throw new Error("Map file has no embedded tileset with tile properties");
  }
  const tileGlyphs = firstTileset.tiles
    .filter((tile): tile is Record<string, unknown> => isRecord(tile))
    .map(parseTileGlyph)
    .filter((entry) => entry !== null);
  return {
    firstGid: readNumber(firstTileset, "firstgid", 1),
    glyphsByTileId: new Map(tileGlyphs),
  };
}

function parseTileLayers(layers: unknown[]): TiledTileLayer[] {
  return layers
    .filter((layer): layer is Record<string, unknown> => isRecord(layer))
    .filter((layer) => layer.type === "tilelayer")
    .map((layer) => {
      const { data } = layer;
      if (!Array.isArray(data) || !data.every((gid) => typeof gid === "number")) {
        throw new Error(`Tile layer "${String(layer.name)}" has no plain tile data`);
      }
      return {
        name: String(layer.name),
        opacity: readNumber(layer, "opacity", 1),
        isVisible: layer.visible !== false,
        gids: data,
      };
    });
}

function parsePlaces(layers: unknown[], placesLayerName: string): TiledPlace[] {
  const placesLayer = layers.find(
    (layer): layer is Record<string, unknown> =>
      isRecord(layer) && layer.type === "objectgroup" && layer.name === placesLayerName,
  );
  if (!placesLayer || !Array.isArray(placesLayer.objects)) return [];
  return placesLayer.objects
    .filter((object): object is Record<string, unknown> => isRecord(object))
    .filter((object) => typeof object.name === "string" && object.name !== "")
    .map((object) => ({
      name: String(object.name),
      x: readNumber(object, "x", 0),
      y: readNumber(object, "y", 0),
      width: readNumber(object, "width", 0),
      height: readNumber(object, "height", 0),
    }));
}

/** Checks the loaded map JSON has what the village view needs; throws a readable error if not. */
export function parseTiledMap(
  data: unknown,
  requiredLayers: readonly string[],
  placesLayerName: string,
): TiledMap {
  if (!isRecord(data)) throw new Error("Map file is not a JSON object (is village.json missing?)");
  const { width, height, tilewidth: tileWidth, tileheight: tileHeight, layers, tilesets } = data;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof tileWidth !== "number" ||
    typeof tileHeight !== "number"
  ) {
    throw new Error("Map file has no width, height, tilewidth or tileheight");
  }
  if (!Array.isArray(layers) || !Array.isArray(tilesets)) {
    throw new Error("Map file has no layers or tilesets");
  }
  const tileset = parseTileset(tilesets);
  const tileLayers = parseTileLayers(layers);
  const layerNames = tileLayers.map((layer) => layer.name);
  const missingLayers = requiredLayers.filter((layerName) => !layerNames.includes(layerName));
  if (missingLayers.length > 0) {
    throw new Error(`Map file is missing tile layers: ${missingLayers.join(", ")}`);
  }
  const places = parsePlaces(layers, placesLayerName);
  return { width, height, tileWidth, tileHeight, tileset, tileLayers, places };
}

/** The glyph a cell's tile is drawn with, or null for an empty cell. */
export function findTileGlyph(map: TiledMap, rawGid: number): Glyph | null {
  const tileId = (rawGid & GID_FLAG_BITS_MASK) - map.tileset.firstGid;
  if (tileId < 0) return null;
  return map.tileset.glyphsByTileId.get(tileId) ?? null;
}
