import type { Position } from "@village/shared";

export interface TileEdge {
  from: Position;
  to: Position;
}

export function tileIndexToPosition(index: number, mapWidth: number): Position {
  return { x: index % mapWidth, y: Math.floor(index / mapWidth) };
}

const NEIGHBOR_SIDES = [
  { dx: 0, dy: -1, from: [0, 0], to: [1, 0] },
  { dx: 1, dy: 0, from: [1, 0], to: [1, 1] },
  { dx: 0, dy: 1, from: [0, 1], to: [1, 1] },
  { dx: -1, dy: 0, from: [0, 0], to: [0, 1] },
] as const;

/** Edges (in tile units) separating the region's tiles from tiles outside it. */
export function computeRegionOutlineEdges(tileIndexes: number[], mapWidth: number): TileEdge[] {
  const region = new Set(tileIndexes);
  const edges: TileEdge[] = [];
  for (const index of region) {
    const tile = tileIndexToPosition(index, mapWidth);
    for (const side of NEIGHBOR_SIDES) {
      const neighborX = tile.x + side.dx;
      const neighborY = tile.y + side.dy;
      const isNeighborInside =
        neighborX >= 0 && neighborX < mapWidth && region.has(neighborY * mapWidth + neighborX);
      if (isNeighborInside) continue;
      edges.push({
        from: { x: tile.x + side.from[0], y: tile.y + side.from[1] },
        to: { x: tile.x + side.to[0], y: tile.y + side.to[1] },
      });
    }
  }
  return edges;
}

/** Largest zoom that fits the map in the view; whole numbers when at least 1x fits. */
export function computeFitZoom(
  viewWidth: number,
  viewHeight: number,
  mapPixelWidth: number,
  mapPixelHeight: number,
): number {
  const exactZoom = Math.min(viewWidth / mapPixelWidth, viewHeight / mapPixelHeight);
  if (!Number.isFinite(exactZoom) || exactZoom <= 0) return 1;
  return exactZoom >= 1 ? Math.floor(exactZoom) : exactZoom;
}

const AGENT_PALETTE = [
  0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c,
  0xfabebe,
];

export function pickAgentColor(agentIndex: number): number {
  return AGENT_PALETTE[agentIndex % AGENT_PALETTE.length] ?? AGENT_PALETTE[0] ?? 0xffffff;
}

export interface TiledMapSummary {
  width: number;
  height: number;
  tileWidth: number;
  tilesetName: string;
  tileLayerNames: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Checks the loaded map JSON has what the village view needs; throws a readable error if not. */
export function summarizeTiledMap(
  data: unknown,
  requiredLayers: readonly string[],
): TiledMapSummary {
  if (!isRecord(data)) throw new Error("Map file is not a JSON object (is village.json missing?)");
  const { width, height, tilewidth: tileWidth, layers, tilesets } = data;
  if (typeof width !== "number" || typeof height !== "number" || typeof tileWidth !== "number") {
    throw new Error("Map file has no width, height or tilewidth");
  }
  if (!Array.isArray(layers) || !Array.isArray(tilesets)) {
    throw new Error("Map file has no layers or tilesets");
  }
  const firstTileset: unknown = tilesets[0];
  if (!isRecord(firstTileset) || typeof firstTileset.name !== "string") {
    throw new Error("Map file has no embedded tileset");
  }
  const tileLayerNames = layers
    .filter(
      (layer): layer is Record<string, unknown> => isRecord(layer) && layer.type === "tilelayer",
    )
    .map((layer) => String(layer.name));
  const missingLayers = requiredLayers.filter((layerName) => !tileLayerNames.includes(layerName));
  if (missingLayers.length > 0) {
    throw new Error(`Map file is missing tile layers: ${missingLayers.join(", ")}`);
  }
  return { width, height, tileWidth, tilesetName: firstTileset.name, tileLayerNames };
}
