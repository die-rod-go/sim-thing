import type { ObjectKind } from "@village/shared";
import { config } from "../../server/src/config";
import type { BuildingSpec, VillageLayout } from "./layout";
import {
  COLLIDING_TILES,
  TILE_NAMES,
  TILE_SIZE,
  TILESET_COLUMNS,
  tileGid,
  type TileName,
} from "./tileset";
import type {
  TiledMap,
  TiledObject,
  TiledObjectLayer,
  TiledProperty,
  TiledTileLayer,
} from "./tiled-types";

export type { TiledMap, TiledObject, TiledObjectLayer, TiledProperty, TiledTileLayer };

const TILED_FORMAT_VERSION = "1.10";
const TILED_EDITOR_VERSION = "1.10.2";
const NO_COMPRESSION = -1;
const EMPTY_TILE = 0;

const OBJECT_KIND_TILES: Record<ObjectKind, TileName> = {
  bed: "bed",
  notice_board: "notice_board",
  bench: "bench",
  wheat_field: "field",
  trees: "tree",
  oven: "oven",
  brew_kettle: "kettle",
  card_table: "card_table",
  door: "door",
};

class TileLayerBuilder {
  readonly data: number[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Array<number>(width * height).fill(EMPTY_TILE);
  }

  set(x: number, y: number, tileName: TileName | null): void {
    this.data[y * this.width + x] = tileName === null ? EMPTY_TILE : tileGid(tileName);
  }

  fillRect(rect: { left: number; top: number; width: number; height: number }, tile: TileName) {
    for (let y = rect.top; y < rect.top + rect.height; y++) {
      for (let x = rect.left; x < rect.left + rect.width; x++) this.set(x, y, tile);
    }
  }
}

function drawBuilding(building: BuildingSpec, ground: TileLayerBuilder, walls: TileLayerBuilder) {
  const { area } = building;
  ground.fillRect(area, building.floor);
  const right = area.left + area.width - 1;
  const bottom = area.top + area.height - 1;
  for (let x = area.left; x <= right; x++) {
    walls.set(x, area.top, "wall");
    walls.set(x, bottom, "wall");
  }
  for (let y = area.top; y <= bottom; y++) {
    walls.set(area.left, y, "wall");
    walls.set(right, y, "wall");
  }
  for (const partition of building.partitions) {
    for (let x = partition.left; x <= partition.right; x++) {
      walls.set(x, partition.y, partition.gaps.includes(x) ? null : "wall");
    }
  }
  for (const door of building.doors) walls.set(door.x, door.y, null);
}

function buildTileLayers(layout: VillageLayout): Record<"ground" | "walls" | "decor", number[]> {
  const { widthTiles, heightTiles } = config.map;
  const ground = new TileLayerBuilder(widthTiles, heightTiles);
  const walls = new TileLayerBuilder(widthTiles, heightTiles);
  const decor = new TileLayerBuilder(widthTiles, heightTiles);

  ground.fillRect({ left: 0, top: 0, width: widthTiles, height: heightTiles }, "grass");
  for (const place of layout.outdoorPlaces) ground.fillRect(place.area, place.ground);
  for (const path of layout.paths) ground.fillRect(path.area, "path");
  const farm = layout.outdoorPlaces.find((place) => place.name === "farm");
  if (farm) {
    ground.fillRect(
      {
        left: farm.area.left + 1,
        top: farm.area.top + 1,
        width: farm.area.width - 2,
        height: farm.area.height - 2,
      },
      "field",
    );
  }
  for (const building of layout.buildings) drawBuilding(building, ground, walls);
  for (let x = 0; x < widthTiles; x++) {
    walls.set(x, 0, "fence");
    walls.set(x, heightTiles - 1, "fence");
  }
  for (let y = 0; y < heightTiles; y++) {
    walls.set(0, y, "fence");
    walls.set(widthTiles - 1, y, "fence");
  }
  for (const tree of layout.decorTrees) decor.set(tree.x, tree.y, "tree");
  for (const object of layout.objects)
    decor.set(object.x, object.y, OBJECT_KIND_TILES[object.kind]);

  return { ground: ground.data, walls: walls.data, decor: decor.data };
}

function buildTileset(): Record<string, unknown> {
  const rows = Math.ceil(TILE_NAMES.length / TILESET_COLUMNS);
  return {
    firstgid: 1,
    name: "village",
    image: "tileset.png",
    imagewidth: TILESET_COLUMNS * TILE_SIZE,
    imageheight: rows * TILE_SIZE,
    columns: TILESET_COLUMNS,
    tilecount: TILE_NAMES.length,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    margin: 0,
    spacing: 0,
    tiles: TILE_NAMES.map((tileName, tileId) => ({
      id: tileId,
      type: tileName,
      properties: [{ name: "collides", type: "bool", value: COLLIDING_TILES.has(tileName) }],
    })),
  };
}

/** Builds the Tiled JSON map. Pure and deterministic: the same layout always gives the same map. */
export function buildTiledMap(layout: VillageLayout): TiledMap {
  const { widthTiles, heightTiles } = config.map;
  let nextObjectId = 1;
  const baseObject = (name: string) => ({
    id: nextObjectId++,
    name,
    type: "",
    rotation: 0,
    visible: true,
  });

  const placeObjects: TiledObject[] = [
    ...layout.buildings.map((building) => ({ ...building, isIndoor: true })),
    ...layout.outdoorPlaces.map((place) => ({ ...place, isIndoor: false })),
  ].map((place) => ({
    ...baseObject(place.name),
    x: place.area.left * TILE_SIZE,
    y: place.area.top * TILE_SIZE,
    width: place.area.width * TILE_SIZE,
    height: place.area.height * TILE_SIZE,
    properties: [{ name: "isIndoor", type: "bool", value: place.isIndoor }],
  }));

  const interactableObjects: TiledObject[] = layout.objects.map((object) => {
    const properties: TiledProperty[] = [
      { name: "name", type: "string", value: object.name },
      { name: "kind", type: "string", value: object.kind },
      { name: "place", type: "string", value: object.place },
      {
        name: "interactions",
        type: "string",
        value: JSON.stringify(config.objects[object.kind].interactions),
      },
    ];
    const stock = (config.objects[object.kind] as { stock?: { capacity: number } }).stock;
    if (stock) properties.push({ name: "stock", type: "int", value: stock.capacity });
    if (object.kind === "door") properties.push({ name: "isOpen", type: "bool", value: true });
    return {
      ...baseObject(object.name),
      x: object.x * TILE_SIZE,
      y: object.y * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties,
    };
  });

  const spawnObjects: TiledObject[] = Object.entries(layout.spawns).map(([placeName, tile]) => ({
    ...baseObject(placeName),
    x: tile.x * TILE_SIZE + TILE_SIZE / 2,
    y: tile.y * TILE_SIZE + TILE_SIZE / 2,
    width: 0,
    height: 0,
    point: true,
  }));

  const tileLayers = buildTileLayers(layout);
  const layerCommon = { x: 0, y: 0, opacity: 1, visible: true };
  const layers: TiledMap["layers"] = [
    ...(["ground", "walls", "decor"] as const).map((name, index) => ({
      id: index + 1,
      name,
      type: "tilelayer" as const,
      width: widthTiles,
      height: heightTiles,
      ...layerCommon,
      data: tileLayers[name],
    })),
    ...(
      [
        ["places", placeObjects],
        ["objects", interactableObjects],
        ["spawns", spawnObjects],
      ] as const
    ).map(([name, objects], index) => ({
      id: index + 4,
      name,
      type: "objectgroup" as const,
      draworder: "topdown" as const,
      ...layerCommon,
      objects: [...objects],
    })),
  ];

  return {
    type: "map",
    version: TILED_FORMAT_VERSION,
    tiledversion: TILED_EDITOR_VERSION,
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    compressionlevel: NO_COMPRESSION,
    width: widthTiles,
    height: heightTiles,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    nextlayerid: layers.length + 1,
    nextobjectid: nextObjectId,
    layers,
    tilesets: [buildTileset()],
  };
}

/** Serializes like Tiled does: indented, with each layer's tile data on one line per map row. */
export function serializeTiledMap(map: TiledMap): string {
  const placeholderPrefix = "@@layer-data-";
  const replaced = {
    ...map,
    layers: map.layers.map((layer, index) =>
      layer.type === "tilelayer" ? { ...layer, data: `${placeholderPrefix}${index}` } : layer,
    ),
  };
  let text = JSON.stringify(replaced, null, 1);
  map.layers.forEach((layer, index) => {
    if (layer.type !== "tilelayer") return;
    const rows: string[] = [];
    for (let row = 0; row < layer.height; row++) {
      rows.push(layer.data.slice(row * layer.width, (row + 1) * layer.width).join(", "));
    }
    text = text.replace(`"${placeholderPrefix}${index}"`, `[${rows.join(",\n  ")}]`);
  });
  return `${text}\n`;
}
