import type { Entity, EntityLocation, NumberValue, Position } from "@village/shared";
import {
  findEntityIfPresent,
  isNestedIn,
  listContents,
  locateInside,
} from "../../items/entity-store";
import { isThingWithin, locateThing, viewThing, type ThingRef } from "../../items/things";
import { readThingName, resolveNumber, scopeOf } from "../../items/values";
import { describePlace } from "../../memory/filing";
import { findPlaceAt } from "../../world/map-loader";
import { isWalkable } from "../../world/pathfinding";
import { buildWalkingGrid } from "../world-access";
import type { WorldState } from "../world-state";
import { findRoleThing } from "./step-roles";
import type { StepRun } from "./step-run";

/** Where `move` and `create` put things: inside a thing, or on the tile where a thing is. */
export interface DestinationSettings {
  into?: string | undefined;
  at?: string | undefined;
  limit?: NumberValue | undefined;
}

export interface Destination {
  location: EntityLocation;
  /** The thing the entities go into; null for a tile. */
  holder: ThingRef | null;
}

const NEIGHBOR_OFFSETS: readonly Position[] = [-1, 0, 1].flatMap((offsetY) =>
  [-1, 0, 1].flatMap((offsetX) =>
    offsetX === 0 && offsetY === 0 ? [] : [{ x: offsetX, y: offsetY }],
  ),
);

function toHolderId(thing: ThingRef): string {
  return thing.kind === "agent" ? thing.agentId : thing.entityId;
}

/** After a missed roll, a thing aimed at lands on a random free tile next to the target, if there is one. */
function findLandingTile(state: WorldState, origin: Position): Position {
  const grid = buildWalkingGrid(state);
  const freeTiles = NEIGHBOR_OFFSETS.map((offset) => ({
    x: origin.x + offset.x,
    y: origin.y + offset.y,
  })).filter((tile) => isWalkable(grid, tile));
  return freeTiles.length > 0 ? state.random.pick(freeTiles) : origin;
}

function locateOnTile(
  state: WorldState,
  thing: ThingRef,
  name: string,
  run: StepRun,
): Destination | null {
  const position = locateThing(state, thing);
  if (position === null) return null;
  const isLandingMiss = name === "target" && run.verbRun?.isHit === false;
  const pos = isLandingMiss ? findLandingTile(state, position.pos) : { ...position.pos };
  return {
    location: { kind: "tile", place: findPlaceAt(state.map, pos), pos },
    holder: null,
  };
}

/** Null when the destination isn't there (an unset `as` name, a gone container). */
export function findDestination(run: StepRun, settings: DestinationSettings): Destination | null {
  const { state } = run.context;
  const name = settings.into ?? settings.at;
  if (name === undefined) throw new Error("A step that places things needs `into` or `at`");
  const thing = findRoleThing(run, name);
  if (thing === null) return null;
  if (settings.into === undefined) return locateOnTile(state, thing, name, run);
  if (viewThing(state, thing) === null) return null;
  return { location: locateInside(toHolderId(thing)), holder: thing };
}

/** Why the dead agents' bodies can't go into the holder: it is one of them, or inside one. */
export function findBodyPlacementRefusal(
  run: StepRun,
  settings: DestinationSettings,
  destination: Destination,
  bodyIds: readonly string[],
): string | null {
  const { holder } = destination;
  if (holder === null) return null;
  const { state } = run.context;
  const isSelfNesting = bodyIds.some((bodyId) => isThingWithin(state, holder, bodyId));
  if (!isSelfNesting) return null;
  const name = describePlace(readThingName(scopeOf(run), settings.into ?? "self"));
  return `${name} can't go inside itself`;
}

/** Why the entities can't go into the holder: it is one of them, inside one of them, or over `limit`. */
export function findPlacementRefusal(
  run: StepRun,
  settings: DestinationSettings,
  destination: Destination,
  moved: readonly Entity[],
  incomingCount: number = moved.length,
): string | null {
  const { holder } = destination;
  if (holder === null) return null;
  const { state } = run.context;
  const scope = scopeOf(run);
  const holderId = toHolderId(holder);
  const name = describePlace(readThingName(scope, settings.into ?? "self"));
  const holderEntity =
    holder.kind === "entity" ? findEntityIfPresent(state, holder.entityId) : undefined;
  const isSelfNesting =
    holderEntity !== undefined &&
    moved.some((entity) => entity.id === holderId || isNestedIn(state, holderEntity, entity.id));
  if (isSelfNesting) return `${name} can't go inside itself`;
  if (settings.limit === undefined) return null;
  const movedIds = new Set(moved.map((entity) => entity.id));
  const present = listContents(state, holderId).filter(
    (entity) => !movedIds.has(entity.id) && !run.setAsideIds?.has(entity.id),
  );
  const room = Math.floor(resolveNumber(scope, settings.limit)) - present.length;
  if (room <= 0) return `${name} was full`;
  return incomingCount > room ? `${name} only had room for ${room} more` : null;
}
