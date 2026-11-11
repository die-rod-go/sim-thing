import type { Position } from "@village/shared";

export interface TileEdge {
  from: Position;
  to: Position;
}

/** The pixel center of a tile, in unscaled map pixels. */
export function tileCenter(position: Position, tileSize: number): Position {
  return { x: position.x * tileSize + tileSize / 2, y: position.y * tileSize + tileSize / 2 };
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

const AGENT_PALETTE = [
  0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c,
  0xfabebe,
];

export function pickAgentColor(agentIndex: number): number {
  return AGENT_PALETTE[agentIndex % AGENT_PALETTE.length] ?? AGENT_PALETTE[0] ?? 0xffffff;
}
