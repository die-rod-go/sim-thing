import { describeCount, type ItemDefinition, type Position, type SeenPlace } from "@village/shared";
import { config } from "../config";
import type { PlaceArea } from "../world/types";
import { canSee, isSightBlockingTile } from "./sight";
import type { PerceptionWorld } from "./types";

/** How much of a place is in view: any tile of it, and a tile sight passes through. */
export interface PlaceSighting {
  isInView: boolean;
  /** A tile that does not block sight is in view, which shows everything the place holds. */
  isInsideInView: boolean;
}

function clampToPlace(position: Position, place: PlaceArea): Position {
  return {
    x: Math.min(Math.max(position.x, place.x), place.x + place.width - 1),
    y: Math.min(Math.max(position.y, place.y), place.y + place.height - 1),
  };
}

/** The place's tiles within sight range, the one nearest the viewer first. */
function listTilesInRange(place: PlaceArea, viewer: Position, rangeTiles: number): Position[] {
  const reach = Math.floor(rangeTiles);
  const nearest = clampToPlace(viewer, place);
  const tiles = [nearest];
  const lastX = Math.min(place.x + place.width - 1, viewer.x + reach);
  const lastY = Math.min(place.y + place.height - 1, viewer.y + reach);
  for (let y = Math.max(place.y, viewer.y - reach); y <= lastY; y += 1) {
    for (let x = Math.max(place.x, viewer.x - reach); x <= lastX; x += 1) {
      if (x !== nearest.x || y !== nearest.y) tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * What the viewer sees of a place. A wall counts as seeing the place, but only a tile sight passes
 * through shows its inside. Stops at the first such tile; with `isInsideOnly`, for a place already
 * seen, tiles that block sight are not looked at.
 */
export function sightPlace(
  world: PerceptionWorld,
  viewer: Position,
  place: PlaceArea,
  rangeTiles: number,
  isInsideOnly: boolean,
): PlaceSighting {
  let isInView = false;
  for (const tile of listTilesInRange(place, viewer, rangeTiles)) {
    const isBlocking = isSightBlockingTile(world, tile);
    if (isBlocking && (isInsideOnly || isInView)) continue;
    if (!canSee(world, viewer, tile, rangeTiles)) continue;
    if (!isBlocking) return { isInView: true, isInsideInView: true };
    isInView = true;
  }
  return { isInView, isInsideInView: false };
}

/** One thing at a place, as far as its name goes. */
export interface PlaceEntityName {
  /** The name the map or a verb gave it, or null. */
  label: string | null;
  definition: ItemDefinition;
}

const NUMBERED_LABEL_PATTERN = /^(.*\S)\s+\d+$/;

interface NameGroup {
  count: number;
  firstName: string;
  describe: (count: number) => string;
}

function describeNumberedLabels(label: string, count: number): string {
  return config.places.numberedLabelsText
    .split("{label}")
    .join(label)
    .split("{count}")
    .join(String(count));
}

/**
 * The names of a place's things as a list reads them: unlabelled ones of the same definition
 * counted ("3 bread"), and labels that differ only by a trailing number together ("tree ×32").
 */
export function collapseEntityNames(entities: readonly PlaceEntityName[]): string[] {
  const groups = new Map<string, NameGroup>();
  for (const { label, definition } of entities) {
    const sharedLabel = label === null ? null : (NUMBERED_LABEL_PATTERN.exec(label)?.[1] ?? label);
    const key = sharedLabel === null ? `definition:${definition.id}` : `label:${sharedLabel}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      continue;
    }
    groups.set(key, {
      count: 1,
      firstName: label ?? describeCount(definition, 1),
      describe:
        sharedLabel === null
          ? (count) => describeCount(definition, count)
          : (count) => describeNumberedLabels(sharedLabel, count),
    });
  }
  return [...groups.values()].map((group) =>
    group.count === 1 ? group.firstName : group.describe(group.count),
  );
}

function hasSameNames(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((name, index) => name === second[index]);
}

export interface SeenPlacesUpdate {
  seenPlaces: SeenPlace[];
  /** A place was added or what one holds reads differently; a later tick alone doesn't count. */
  hasNewKnowledge: boolean;
}

/** A place in view this tick, with what it holds when its inside is in view. */
export interface PlaceInView {
  name: string;
  /** Null when only the outside is in view. */
  entityNames: string[] | null;
}

/** Adds the places newly in view and replaces what is known of each place whose inside is in view. */
export function mergeSeenPlaces(
  seenPlaces: readonly SeenPlace[],
  placesInView: readonly PlaceInView[],
  tick: number,
): SeenPlacesUpdate {
  const inViewByName = new Map(placesInView.map((place) => [place.name, place]));
  let hasNewKnowledge = false;
  const updated = seenPlaces.map((seenPlace): SeenPlace => {
    const names = inViewByName.get(seenPlace.name)?.entityNames ?? null;
    if (names === null) return seenPlace;
    if (seenPlace.entities === null || !hasSameNames(seenPlace.entities.names, names)) {
      hasNewKnowledge = true;
    }
    return { ...seenPlace, entities: { tick, names } };
  });
  const knownNames = new Set(seenPlaces.map((seenPlace) => seenPlace.name));
  for (const place of placesInView) {
    if (knownNames.has(place.name)) continue;
    hasNewKnowledge = true;
    updated.push({
      name: place.name,
      firstSeenTick: tick,
      entities: place.entityNames === null ? null : { tick, names: place.entityNames },
    });
  }
  return { seenPlaces: updated, hasNewKnowledge };
}
