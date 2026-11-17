import type { Position } from "@village/shared";
import { config } from "../config";
import { findPlaceAt } from "./map-loader";
import { isWalkable } from "./pathfinding";
import type { PlaceArea, WorldMap } from "./types";

/** Tiles between the position and the nearest tile of the area; 0 inside it. */
function measureDistanceToArea(place: PlaceArea, position: Position): number {
  const outsideX = Math.max(place.x - position.x, 0, position.x - (place.x + place.width - 1));
  const outsideY = Math.max(place.y - position.y, 0, position.y - (place.y + place.height - 1));
  return Math.max(outsideX, outsideY);
}

function measureDistanceToCenter(place: PlaceArea, position: Position): number {
  const centerX = place.x + (place.width - 1) / 2;
  const centerY = place.y + (place.height - 1) / 2;
  return Math.hypot(position.x - centerX, position.y - centerY);
}

/** The place nearest the position; an indoor place wins a tie, then the first on the map. */
export function findNearestPlace(map: WorldMap, position: Position): PlaceArea | null {
  let nearest: PlaceArea | null = null;
  let nearestDistance = Infinity;
  for (const place of map.places) {
    const distance = measureDistanceToArea(place, position);
    const isCloser = distance < nearestDistance;
    const isIndoorTie = distance === nearestDistance && place.isIndoor && !nearest?.isIndoor;
    if (isCloser || isIndoorTie) {
      nearest = place;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** "the road by the smithy": how a spot outside every place reads, after the place it is by. */
export function describeOutdoorSpot(placeName: string): string {
  return config.perception.outdoorPlaceText.split("{place}").join(placeName);
}

/**
 * The name a position goes by in prompts and memories: its place, or outside every place, the
 * road by the nearest one. `place` is the position's place as the agent or event records it.
 */
export function describeLocation(map: WorldMap, place: string, position: Position): string {
  if (place !== config.map.defaultOutdoorPlace) return place;
  const nearest = findNearestPlace(map, position);
  return nearest === null ? place : describeOutdoorSpot(nearest.name);
}

interface OutdoorSpot {
  pos: Position;
  areaDistance: number;
  centerDistance: number;
}

function isCloserSpot(candidate: OutdoorSpot, existing: OutdoorSpot | undefined): boolean {
  if (existing === undefined) return true;
  if (candidate.areaDistance !== existing.areaDistance) {
    return candidate.areaDistance < existing.areaDistance;
  }
  return candidate.centerDistance < existing.centerDistance;
}

function findOutdoorSpots(map: WorldMap): Map<string, Position> {
  const spots = new Map<string, OutdoorSpot>();
  for (let y = 0; y < map.grid.height; y += 1) {
    for (let x = 0; x < map.grid.width; x += 1) {
      const position = { x, y };
      if (!isWalkable(map.grid, position)) continue;
      if (findPlaceAt(map, position) !== config.map.defaultOutdoorPlace) continue;
      const nearest = findNearestPlace(map, position);
      if (nearest === null) continue;
      const candidate = {
        pos: position,
        areaDistance: measureDistanceToArea(nearest, position),
        centerDistance: measureDistanceToCenter(nearest, position),
      };
      if (isCloserSpot(candidate, spots.get(nearest.name))) spots.set(nearest.name, candidate);
    }
  }
  return new Map([...spots].map(([placeName, spot]) => [placeName, spot.pos]));
}

const outdoorSpotsByMap = new WeakMap<WorldMap, Map<string, Position>>();

/**
 * The tile "the road by the <place>" stands for: the walkable tile outside every place, of those
 * named after this place, nearest to it. Null when no outdoor tile is named after it.
 */
export function findOutdoorSpot(map: WorldMap, placeName: string): Position | null {
  let spots = outdoorSpotsByMap.get(map);
  if (spots === undefined) {
    spots = findOutdoorSpots(map);
    outdoorSpotsByMap.set(map, spots);
  }
  return spots.get(placeName) ?? null;
}

/** Every outdoor spot a `walk_to` can name, with the tile it leads to. */
export function listOutdoorSpots(map: WorldMap): { name: string; pos: Position }[] {
  return map.places.flatMap((place) => {
    const pos = findOutdoorSpot(map, place.name);
    return pos === null ? [] : [{ name: describeOutdoorSpot(place.name), pos }];
  });
}
