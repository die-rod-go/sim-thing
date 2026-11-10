import type { Position } from "@village/shared";
import { isInsideGrid, tileIndex } from "../world/types";
import type { PerceptionWorld } from "./types";

export function isSightBlockingTile(world: PerceptionWorld, position: Position): boolean {
  if (!isInsideGrid(world.grid, position)) return true;
  const index = tileIndex(world.grid, position);
  return world.grid.isWall[index] === true || world.closedDoorTiles.has(index);
}

export function computeTileDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Walks a supercover line between tile centers. Every tile the line touches between viewer and
 * target must be clear. Where the line passes exactly through a tile corner, it is blocked only if
 * both tiles beside that corner block, so two touching diagonal walls seal the gap. The walk is
 * the same geometry in both directions, so sight is symmetric.
 */
function isLineClear(world: PerceptionWorld, from: Position, to: Position): boolean {
  const stepsX = Math.abs(to.x - from.x);
  const stepsY = Math.abs(to.y - from.y);
  const directionX = Math.sign(to.x - from.x);
  const directionY = Math.sign(to.y - from.y);
  let currentX = from.x;
  let currentY = from.y;
  let takenX = 0;
  let takenY = 0;
  while (takenX < stepsX || takenY < stepsY) {
    const crossingBalance = (1 + 2 * takenX) * stepsY - (1 + 2 * takenY) * stepsX;
    if (crossingBalance === 0) {
      const isSideXBlocking = isSightBlockingTile(world, { x: currentX + directionX, y: currentY });
      const isSideYBlocking = isSightBlockingTile(world, { x: currentX, y: currentY + directionY });
      if (isSideXBlocking && isSideYBlocking) return false;
      currentX += directionX;
      currentY += directionY;
      takenX += 1;
      takenY += 1;
    } else if (crossingBalance < 0) {
      currentX += directionX;
      takenX += 1;
    } else {
      currentY += directionY;
      takenY += 1;
    }
    const isTarget = currentX === to.x && currentY === to.y;
    if (!isTarget && isSightBlockingTile(world, { x: currentX, y: currentY })) return false;
  }
  return true;
}

export function canSee(
  world: PerceptionWorld,
  from: Position,
  to: Position,
  rangeTiles: number,
): boolean {
  if (!isInsideGrid(world.grid, from) || !isInsideGrid(world.grid, to)) return false;
  if (computeTileDistance(from, to) > rangeTiles) return false;
  return isLineClear(world, from, to);
}

/** Tile indexes visible from a position, for the debug overlay. */
export function computeVisibleTiles(
  world: PerceptionWorld,
  from: Position,
  rangeTiles: number,
): number[] {
  const visibleTiles: number[] = [];
  const reach = Math.floor(rangeTiles);
  for (let y = from.y - reach; y <= from.y + reach; y += 1) {
    for (let x = from.x - reach; x <= from.x + reach; x += 1) {
      const target = { x, y };
      if (canSee(world, from, target, rangeTiles)) {
        visibleTiles.push(tileIndex(world.grid, target));
      }
    }
  }
  return visibleTiles;
}
