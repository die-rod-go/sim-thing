import type { Position } from "@village/shared";
import { isInsideGrid, tileIndex, type PlaceArea, type TileGrid, type WorldMap } from "./types";

const NEIGHBOR_OFFSETS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function isWalkable(grid: TileGrid, position: Position): boolean {
  return isInsideGrid(grid, position) && grid.isWall[tileIndex(grid, position)] === false;
}

function manhattanDistance(from: Position, to: Position): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function positionAt(grid: TileGrid, index: number): Position {
  return { x: index % grid.width, y: Math.floor(index / grid.width) };
}

function rebuildPath(grid: TileGrid, cameFrom: Map<number, number>, endIndex: number): Position[] {
  const path: Position[] = [];
  let current: number | undefined = endIndex;
  while (current !== undefined && cameFrom.has(current)) {
    path.push(positionAt(grid, current));
    current = cameFrom.get(current);
  }
  return path.reverse();
}

/**
 * A* on the 4-connected grid toward the nearest of several goal tiles. Walls block; gaps in
 * walls are plain floor in the grid. Returns the tiles to step
 * through, excluding `from` and ending on a goal; [] if `from` is already a goal; null if no goal
 * can be reached.
 */
export function findPathToAny(
  grid: TileGrid,
  from: Position,
  goals: readonly Position[],
): Position[] | null {
  const goalIndexes = new Set(
    goals.filter((goal) => isWalkable(grid, goal)).map((goal) => tileIndex(grid, goal)),
  );
  if (goalIndexes.size === 0 || !isInsideGrid(grid, from)) return null;
  const startIndex = tileIndex(grid, from);
  if (goalIndexes.has(startIndex)) return [];

  const goalPositions = [...goalIndexes].map((index) => positionAt(grid, index));
  const estimateRemaining = (position: Position) =>
    Math.min(...goalPositions.map((goal) => manhattanDistance(position, goal)));

  const costSoFar = new Map<number, number>([[startIndex, 0]]);
  const estimatedTotal = new Map<number, number>([[startIndex, estimateRemaining(from)]]);
  const cameFrom = new Map<number, number>();
  const openSet = new Set<number>([startIndex]);

  while (openSet.size > 0) {
    let currentIndex = -1;
    let bestEstimate = Infinity;
    for (const candidate of openSet) {
      const estimate = estimatedTotal.get(candidate) ?? Infinity;
      if (estimate < bestEstimate) {
        bestEstimate = estimate;
        currentIndex = candidate;
      }
    }
    if (goalIndexes.has(currentIndex)) return rebuildPath(grid, cameFrom, currentIndex);
    openSet.delete(currentIndex);

    const current = positionAt(grid, currentIndex);
    const currentCost = costSoFar.get(currentIndex) ?? Infinity;
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      if (!isWalkable(grid, neighbor)) continue;
      const neighborIndex = tileIndex(grid, neighbor);
      const tentativeCost = currentCost + 1;
      if (tentativeCost >= (costSoFar.get(neighborIndex) ?? Infinity)) continue;
      cameFrom.set(neighborIndex, currentIndex);
      costSoFar.set(neighborIndex, tentativeCost);
      estimatedTotal.set(neighborIndex, tentativeCost + estimateRemaining(neighbor));
      openSet.add(neighborIndex);
    }
  }
  return null;
}

export function findPath(grid: TileGrid, from: Position, to: Position): Position[] | null {
  return findPathToAny(grid, from, [to]);
}

/** Tiles an agent can stand on inside a place; for indoor places, the walls and doorways are left out. */
export function listPlaceTiles(grid: TileGrid, place: PlaceArea): Position[] {
  const inset = place.isIndoor ? 1 : 0;
  const tiles: Position[] = [];
  for (let y = place.y + inset; y < place.y + place.height - inset; y++) {
    for (let x = place.x + inset; x < place.x + place.width - inset; x++) {
      if (isWalkable(grid, { x, y })) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Path to the nearest walkable tile inside the named place; null for an unknown place. */
export function findPathToPlace(
  map: WorldMap,
  grid: TileGrid,
  from: Position,
  placeName: string,
): Position[] | null {
  const place = map.places.find((area) => area.name === placeName);
  if (!place) return null;
  return findPathToAny(grid, from, listPlaceTiles(grid, place));
}

/** Path onto the tile if it is walkable, otherwise to a walkable tile next to it. */
export function findPathToTile(grid: TileGrid, from: Position, tile: Position): Position[] | null {
  if (isWalkable(grid, tile)) return findPath(grid, from, tile);
  const adjacentTiles = NEIGHBOR_OFFSETS.map((offset) => ({
    x: tile.x + offset.x,
    y: tile.y + offset.y,
  }));
  return findPathToAny(grid, from, adjacentTiles);
}

/** The grid with more tiles walled off, e.g. where objects stand in the way. */
export function withBlockedTiles(grid: TileGrid, blockedIndexes: ReadonlySet<number>): TileGrid {
  if (blockedIndexes.size === 0) return grid;
  return {
    ...grid,
    isWall: grid.isWall.map((isWall, index) => isWall || blockedIndexes.has(index)),
  };
}
