import type { Entity, Position } from "@village/shared";
import { computeChebyshevDistance } from "../../economy/give";
import { moveEntity } from "../../items/entity-store";
import { findPlaceAt } from "../../world/map-loader";
import { findPathToAny, isWalkable } from "../../world/pathfinding";
import type { TileGrid } from "../../world/types";
import type { TickContext } from "../tick-context";
import { markEntityChanged } from "../world-access";

/*
 * A creature moves one tile a tick on the same grid agents walk: walls and closed doors stop it.
 */

const STEP_OFFSETS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function listOpenNeighbors(grid: TileGrid, from: Position): Position[] {
  return STEP_OFFSETS.map((offset) => ({ x: from.x + offset.x, y: from.y + offset.y })).filter(
    (tile) => isWalkable(grid, tile),
  );
}

function moveCreature(context: TickContext, creature: Entity, pos: Position): void {
  const { state, result } = context;
  moveEntity(state, creature.id, { kind: "tile", place: findPlaceAt(state.map, pos), pos });
  markEntityChanged(result, creature.id);
}

function readTile(creature: Entity): Position {
  if (creature.location.kind !== "tile") {
    throw new Error(`Creature ${creature.id} is not on a tile`);
  }
  return creature.location.pos;
}

/** Every walkable tile within `reach` of the target: where the creature can act on it from. */
export function listTilesWithinReach(grid: TileGrid, target: Position, reach: number): Position[] {
  const tiles: Position[] = [];
  for (let offsetY = -reach; offsetY <= reach; offsetY += 1) {
    for (let offsetX = -reach; offsetX <= reach; offsetX += 1) {
      const tile = { x: target.x + offsetX, y: target.y + offsetY };
      if (isWalkable(grid, tile)) tiles.push(tile);
    }
  }
  return tiles;
}

/** Takes one step along the shortest path to any goal. False when no goal can be reached. */
export function stepTowardAny(
  context: TickContext,
  grid: TileGrid,
  creature: Entity,
  goals: readonly Position[],
): boolean {
  const path = findPathToAny(grid, readTile(creature), goals);
  if (path === null) return false;
  const [next] = path;
  if (next !== undefined) moveCreature(context, creature, next);
  return true;
}

function measureSafety(tile: Position, threats: readonly Position[]): number {
  return Math.min(...threats.map((threat) => computeChebyshevDistance(tile, threat)));
}

/** Steps to the neighboring tile farthest from every threat, if one is farther than here. */
export function stepAway(
  context: TickContext,
  grid: TileGrid,
  creature: Entity,
  threats: readonly Position[],
): void {
  const here = readTile(creature);
  let best = { tile: here, safety: measureSafety(here, threats) };
  for (const tile of listOpenNeighbors(grid, here)) {
    const safety = measureSafety(tile, threats);
    if (safety > best.safety) best = { tile, safety };
  }
  if (best.tile !== here) moveCreature(context, creature, best.tile);
}

/** Steps to a random open neighboring tile, if there is one. */
export function stepAtRandom(context: TickContext, grid: TileGrid, creature: Entity): void {
  const neighbors = listOpenNeighbors(grid, readTile(creature));
  if (neighbors.length > 0) moveCreature(context, creature, context.state.random.pick(neighbors));
}
