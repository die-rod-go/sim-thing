import type { Position } from "@village/shared";

/** Counter-clockwise from east, matching Math.atan2 with north as up (y grows southward). */
const COMPASS_WORDS: readonly string[] = [
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
  "south",
  "south-east",
];

const FULL_TURN_RADIANS = 2 * Math.PI;
const SECTOR_RADIANS = FULL_TURN_RADIANS / COMPASS_WORDS.length;

export function describeDirection(from: Position, to: Position): string {
  const offsetX = to.x - from.x;
  const offsetNorth = from.y - to.y;
  if (offsetX === 0 && offsetNorth === 0) return "right here";
  const angle = (Math.atan2(offsetNorth, offsetX) + FULL_TURN_RADIANS) % FULL_TURN_RADIANS;
  const sector = Math.round(angle / SECTOR_RADIANS) % COMPASS_WORDS.length;
  return COMPASS_WORDS[sector] ?? "nearby";
}
