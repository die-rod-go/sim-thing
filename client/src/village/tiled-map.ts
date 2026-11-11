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
  columns: number;
  margin: number;
  spacing: number;
}

export interface TiledTileLayer {
  name: string;
  opacity: number;
  isVisible: boolean;
  /** Global tile ids, row by row; 0 means no tile. */
  gids: number[];
}

export interface TileSourceRect {
  x: number;
  y: number;
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

function parseTileset(tilesets: unknown[]): TiledTileset {
  const firstTileset: unknown = tilesets[0];
  if (!isRecord(firstTileset) || typeof firstTileset.columns !== "number") {
    throw new Error("Map file has no embedded tileset");
  }
  return {
    firstGid: readNumber(firstTileset, "firstgid", 1),
    columns: firstTileset.columns,
    margin: readNumber(firstTileset, "margin", 0),
    spacing: readNumber(firstTileset, "spacing", 0),
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

/** Where a tile's image sits in the tileset, or null for an empty cell. */
export function findTileSourceRect(map: TiledMap, rawGid: number): TileSourceRect | null {
  const localId = (rawGid & GID_FLAG_BITS_MASK) - map.tileset.firstGid;
  if (localId < 0) return null;
  const { columns, margin, spacing } = map.tileset;
  const column = localId % columns;
  const row = Math.floor(localId / columns);
  return {
    x: margin + column * (map.tileWidth + spacing),
    y: margin + row * (map.tileHeight + spacing),
  };
}
