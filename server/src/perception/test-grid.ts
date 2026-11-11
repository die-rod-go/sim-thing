import type { Position, WorldEvent } from "@village/shared";
import { tileIndex } from "../world/types";
import type { PerceptionWorld } from "./types";

const WALL_CHARACTER = "#";
const CLOSED_DOOR_CHARACTER = "D";
const MARKER_PATTERN = /^[a-z]$/;

export interface AsciiWorld {
  world: PerceptionWorld;
  /** Positions of lowercase marker letters, which stand on open floor. */
  markers: Record<string, Position>;
}

/**
 * Test helper: builds a perception world from ASCII art. "#" is a wall, "D" a closed door,
 * lowercase letters are named open tiles, anything else (".", "O" for an open door) is open floor.
 */
export function buildAsciiWorld(art: string): AsciiWorld {
  const rows = art
    .trim()
    .split("\n")
    .map((row) => row.trim());
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const grid = { width, height, isWall: new Array<boolean>(width * height).fill(false) };
  const closedDoorTiles = new Set<number>();
  const markers: Record<string, Position> = {};
  rows.forEach((row, y) => {
    [...row].forEach((character, x) => {
      const index = tileIndex(grid, { x, y });
      if (character === WALL_CHARACTER) grid.isWall[index] = true;
      if (character === CLOSED_DOOR_CHARACTER) closedDoorTiles.add(index);
      if (MARKER_PATTERN.test(character)) markers[character] = { x, y };
    });
  });
  return {
    world: { grid, sightBlockingTiles: closedDoorTiles, muffledTiles: closedDoorTiles },
    markers,
  };
}

export function requireMarker(asciiWorld: AsciiWorld, marker: string): Position {
  const position = asciiWorld.markers[marker];
  if (position === undefined) throw new Error(`Marker "${marker}" is not on the test grid`);
  return position;
}

/** Test helper: a world event with sensible defaults. */
export function buildTestEvent(overrides: Partial<WorldEvent> & { pos: Position }): WorldEvent {
  return {
    id: 1,
    tick: 100,
    actorId: "speaker",
    actorName: "Speaker",
    kind: "said",
    targetId: null,
    targetName: null,
    place: "square",
    description: "said something",
    loudness: null,
    ...overrides,
  };
}
