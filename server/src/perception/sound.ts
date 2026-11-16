import type { Position, Volume } from "@village/shared";
import { config } from "../config";
import type { TileGrid } from "../world/types";
import { isInsideGrid, tileIndex } from "../world/types";
import type { Hearing, PerceptionWorld } from "./types";

/** Path cost of sound from a source, by tile index, for the tiles it reaches. */
export type SoundCosts = ReadonlyMap<number, number>;

const NEIGHBOR_OFFSETS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

const soundCostCache = new WeakMap<TileGrid, Map<string, SoundCosts>>();

export function clearSoundCostCache(grid: TileGrid): void {
  soundCostCache.delete(grid);
}

/** The cost for sound to reach a tile; Infinity where it does not. */
export function readSoundCost(costs: SoundCosts, grid: TileGrid, position: Position): number {
  if (!isInsideGrid(grid, position)) return Infinity;
  return costs.get(tileIndex(grid, position)) ?? Infinity;
}

function computeEnteringCost(world: PerceptionWorld, index: number, isDiagonal: boolean): number {
  const tileCost = world.muffledTiles.has(index)
    ? config.perception.closedDoorSoundCost
    : config.perception.openTileSoundCost;
  return isDiagonal ? tileCost * config.perception.diagonalSoundCostMultiplier : tileCost;
}

function isSoundBlockingCornerSide(world: PerceptionWorld, position: Position): boolean {
  if (!isInsideGrid(world.grid, position)) return true;
  const index = tileIndex(world.grid, position);
  return world.grid.isWall[index] === true || world.muffledTiles.has(index);
}

/**
 * A diagonal step squeezes past a corner only when at least one tile beside it is open, as sight
 * does, so two touching walls seal the gap and a closed door can't be stepped around.
 */
function canPassCorner(world: PerceptionWorld, from: Position, offset: Position): boolean {
  const isSideXBlocking = isSoundBlockingCornerSide(world, { x: from.x + offset.x, y: from.y });
  const isSideYBlocking = isSoundBlockingCornerSide(world, { x: from.x, y: from.y + offset.y });
  return !(isSideXBlocking && isSideYBlocking);
}

/**
 * How many steps sound can travel at most before its cost runs past `maxCost`. Each step moves at
 * most one tile along each axis, so this bounds the larger of the two axis distances.
 */
function computeReachSteps(maxCost: number): number {
  const cheapestStep = Math.min(
    config.perception.openTileSoundCost,
    config.perception.closedDoorSoundCost,
  );
  return cheapestStep > 0 ? Math.floor(maxCost / cheapestStep) : Infinity;
}

/** Only closed doors the sound could reach change the fill, so only those are in the key. */
function buildCacheKey(world: PerceptionWorld, source: Position, maxCost: number): string {
  const { width } = world.grid;
  const reachSteps = computeReachSteps(maxCost);
  const doorsInReach = [...world.muffledTiles]
    .filter((index) => {
      const distance = Math.max(
        Math.abs((index % width) - source.x),
        Math.abs(Math.floor(index / width) - source.y),
      );
      return distance <= reachSteps;
    })
    .sort((first, second) => first - second);
  return `${tileIndex(world.grid, source)}|${maxCost}|${doorsInReach.join(",")}`;
}

/**
 * Shortest sound path cost from the source over open tiles, in eight directions; walls block. Relaxation with a work
 * queue over only the tiles within reach: costs are non-negative, so this settles quickly.
 */
function fillSoundCosts(world: PerceptionWorld, source: Position, maxCost: number): SoundCosts {
  const { grid } = world;
  const sourceIndex = tileIndex(grid, source);
  const costs = new Map<number, number>([[sourceIndex, 0]]);
  const pendingIndexes: number[] = [sourceIndex];
  for (let queuePosition = 0; queuePosition < pendingIndexes.length; queuePosition += 1) {
    const currentIndex = pendingIndexes[queuePosition] ?? sourceIndex;
    const currentCost = costs.get(currentIndex) ?? Infinity;
    const current = { x: currentIndex % grid.width, y: Math.floor(currentIndex / grid.width) };
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      if (!isInsideGrid(grid, neighbor)) continue;
      const neighborIndex = tileIndex(grid, neighbor);
      if (grid.isWall[neighborIndex] === true) continue;
      const isDiagonal = offset.x !== 0 && offset.y !== 0;
      if (isDiagonal && !canPassCorner(world, current, offset)) continue;
      const candidateCost = currentCost + computeEnteringCost(world, neighborIndex, isDiagonal);
      if (candidateCost > maxCost || candidateCost >= (costs.get(neighborIndex) ?? Infinity)) {
        continue;
      }
      costs.set(neighborIndex, candidateCost);
      pendingIndexes.push(neighborIndex);
    }
  }
  return costs;
}

/** Sound path costs from a source tile, cached by source tile, doors in reach and reach. Read-only. */
export function computeSoundCosts(
  world: PerceptionWorld,
  source: Position,
  maxCost: number,
): SoundCosts {
  if (!isInsideGrid(world.grid, source)) return new Map();
  const cacheKey = buildCacheKey(world, source, maxCost);
  let gridCache = soundCostCache.get(world.grid);
  if (gridCache === undefined) {
    gridCache = new Map();
    soundCostCache.set(world.grid, gridCache);
  }
  const cachedCosts = gridCache.get(cacheKey);
  if (cachedCosts !== undefined) return cachedCosts;
  if (gridCache.size >= config.perception.soundCacheMaxEntries) gridCache.clear();
  const costs = fillSoundCosts(world, source, maxCost);
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
  return [...costs]
    .filter(([, cost]) => cost <= loudness)
    .map(([index]) => index)
    .sort((first, second) => first - second);
}
