import type { Position } from "@village/shared";

/** Collision grid, row-major: index = y * width + x. */
export interface TileGrid {
  width: number;
  height: number;
  isWall: boolean[];
}

/** A named rectangular area, in tiles. Indoor places are enclosed by walls with gaps. */
export interface PlaceArea {
  name: string;
  isIndoor: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An object the map places: which item definition, and the name it goes by ("tavern chest"). */
export interface MapPlacement {
  label: string;
  definitionId: string;
  place: string;
  pos: Position;
}

export interface WorldMap {
  grid: TileGrid;
  places: PlaceArea[];
  /** Placed objects, loaded as tile entities when a world is seeded. Doors are placements too. */
  placements: MapPlacement[];
  /** Named spawn tiles from the map, used by seeds ("rose cottage", "tavern", ...). */
  spawnPoints: Record<string, Position>;
}

export function tileIndex(grid: TileGrid, position: Position): number {
  return position.y * grid.width + position.x;
}

export function isInsideGrid(grid: TileGrid, position: Position): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < grid.width && position.y < grid.height;
}
