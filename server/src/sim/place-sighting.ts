import type { Agent, Entity } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { getDefinition, listTileEntitiesAt, type EntityWorld } from "../items/entity-store";
import { buildEntityView, listVerbsForView } from "../items/verb-offers";
import { isLyingWhenOnTile, isOmittedFromPlaceListing } from "../items/world-physics";
import {
  collapseEntityNames,
  mergeSeenPlaces,
  sightPlace,
  type PlaceInView,
  type SeenPlacesUpdate,
} from "../perception/seen-places";
import type { PerceptionWorld } from "../perception/types";
import type { WorldState } from "./world-state";

/**
 * Whether a seen place lists the entity: something a person can do something with, or a loose
 * item, unless `world.placeListingOmits` leaves it out (doors, windows, benches).
 */
function isWorthListing(world: EntityWorld, entity: Entity): boolean {
  if (isOmittedFromPlaceListing(world, entity)) return false;
  if (isLyingWhenOnTile(world, entity)) return true;
  const view = { ...buildEntityView(world, "", entity), where: "here" as const };
  return listVerbsForView(world, view).length > 0;
}

/** What a place holds that is worth knowing, as a seen place lists it. */
export function listPlaceEntityNames(world: EntityWorld, placeName: string): string[] {
  const worthListing = listTileEntitiesAt(world, placeName).filter((entity) =>
    isWorthListing(world, entity),
  );
  return collapseEntityNames(
    worthListing.map((entity) => ({
      label: entity.label,
      definition: getDefinition(world, entity),
    })),
  );
}

/**
 * The agent's seen places after looking around this tick: places newly in view are added, and a
 * place whose inside is in view gets the list of what is really there. Sleepers see nothing.
 */
export function lookAtPlaces(
  state: WorldState,
  world: PerceptionWorld,
  agent: Agent,
): SeenPlacesUpdate {
  if (isAsleep(agent)) return { seenPlaces: agent.seenPlaces, hasNewKnowledge: false };
  const seenNames = new Set(agent.seenPlaces.map((seenPlace) => seenPlace.name));
  const placesInView = state.map.places.flatMap((place): PlaceInView[] => {
    const sighting = sightPlace(
      world,
      agent.pos,
      place,
      config.perception.sightRangeTiles,
      seenNames.has(place.name),
    );
    if (sighting.isInsideInView) {
      return [{ name: place.name, entityNames: listPlaceEntityNames(state, place.name) }];
    }
    return sighting.isInView ? [{ name: place.name, entityNames: null }] : [];
  });
  return mergeSeenPlaces(agent.seenPlaces, placesInView, state.tick);
}
