import type { Position, Volume } from "@village/shared";
import { config } from "../config";
import type { TileGrid } from "../world/types";
import { isInsideGrid, tileIndex } from "../world/types";
import type { Hearing, PerceptionWorld } from "./types";

/** Path cost of sound from a source to each tile index; Infinity where it does not reach. */
export type SoundCosts = readonly number[];

const NEIGHBOR_OFFSETS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const soundCostCache = new WeakMap<TileGrid, Map<string, SoundCosts>>();

export function clearSoundCostCache(grid: TileGrid): void {
  soundCostCache.delete(grid);
}

function computeEnteringCost(world: PerceptionWorld, index: number): number {
  return world.muffledTiles.has(index)
    ? config.perception.closedDoorSoundCost
    : config.perception.openTileSoundCost;
}

function buildCacheKey(world: PerceptionWorld, sourceIndex: number, maxCost: number): string {
  const doorSignature = [...world.muffledTiles].sort((first, second) => first - second);
  return `${sourceIndex}|${maxCost}|${doorSignature.join(",")}`;
}

/**
 * Shortest sound path cost from the source over open tiles; walls block. Relaxation with a work
 * queue: the grid is small and costs are non-negative, so this settles quickly.
 */
function fillSoundCosts(world: PerceptionWorld, source: Position, maxCost: number): number[] {
  const { grid } = world;
  const costs = new Array<number>(grid.width * grid.height).fill(Infinity);
  if (!isInsideGrid(grid, source)) return costs;
  const sourceIndex = tileIndex(grid, source);
  costs[sourceIndex] = 0;
  const pendingIndexes: number[] = [sourceIndex];
  for (let queuePosition = 0; queuePosition < pendingIndexes.length; queuePosition += 1) {
    const currentIndex = pendingIndexes[queuePosition] ?? sourceIndex;
    const current = { x: currentIndex % grid.width, y: Math.floor(currentIndex / grid.width) };
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      if (!isInsideGrid(grid, neighbor)) continue;
      const neighborIndex = tileIndex(grid, neighbor);
      if (grid.isWall[neighborIndex] === true) continue;
      const candidateCost =
        (costs[currentIndex] ?? Infinity) + computeEnteringCost(world, neighborIndex);
      if (candidateCost > maxCost || candidateCost >= (costs[neighborIndex] ?? Infinity)) continue;
      costs[neighborIndex] = candidateCost;
      pendingIndexes.push(neighborIndex);
    }
  }
  return costs;
}

/** Sound path costs from a source tile, cached by source tile, muffled tiles and reach. Read-only. */
export function computeSoundCosts(
  world: PerceptionWorld,
  source: Position,
  maxCost: number,
): SoundCosts {
  const sourceIndex = isInsideGrid(world.grid, source) ? tileIndex(world.grid, source) : -1;
  const cacheKey = buildCacheKey(world, sourceIndex, maxCost);
  let gridCache = soundCostCache.get(world.grid);
  if (gridCache === undefined) {
    gridCache = new Map();
    soundCostCache.set(world.grid, gridCache);
  }
  const cachedCosts = gridCache.get(cacheKey);
  if (cachedCosts !== undefined) return cachedCosts;
  if (gridCache.size >= config.perception.soundCacheMaxEntries) gridCache.clear();
  const costs = Object.freeze(fillSoundCosts(world, source, maxCost));
  gridCache.set(cacheKey, costs);
  return costs;
}

export function classifyHearing(pathCost: number, loudness: number): Hearing {
  if (pathCost <= loudness) return "clear";
  if (pathCost <= loudness * config.perception.muffledReachMultiplier) return "muffled";
  return "none";
}

export function computeMuffledReach(loudness: number): number {
  return loudness * config.perception.muffledReachMultiplier;
}

/** Tile indexes where speech at this volume is heard clearly, for the debug overlay. */
export function computeSpeechReachTiles(
  world: PerceptionWorld,
  from: Position,
  volume: Volume,
): number[] {
  const loudness = config.perception.speechLoudness[volume];
  const costs = computeSoundCosts(world, from, loudness);
  const reachTiles: number[] = [];
  costs.forEach((cost, index) => {
    if (cost <= loudness) reachTiles.push(index);
  });
  return reachTiles;
}
