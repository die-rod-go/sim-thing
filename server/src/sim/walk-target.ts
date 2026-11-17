import type { Agent, Entity, Position } from "@village/shared";
import { config } from "../config";
import { scoreNameMatch } from "../decision/name-match";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance } from "../economy/give";
import { describeEntityName } from "../items/entity-store";
import { listOutdoorSpots } from "../world/place-names";
import type { PlaceArea } from "../world/types";
import type { WalkDestination } from "./agent-runtime";
import { isCreature } from "./creatures/creature-instincts";
import { listHereEntities } from "./here-entities";
import { listOthersAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

interface WalkCandidate {
  name: string;
  destination: WalkDestination;
  placeName: string;
  pos: Position;
}

interface RankedCandidate {
  candidate: WalkCandidate;
  score: number;
  isInSeenPlace: boolean;
  distance: number;
}

function findPlaceCenter(place: PlaceArea): Position {
  return { x: place.x + Math.floor(place.width / 2), y: place.y + Math.floor(place.height / 2) };
}

function describePlaceCandidate(place: PlaceArea): WalkCandidate {
  return {
    name: place.name,
    destination: { kind: "place", placeName: place.name },
    placeName: place.name,
    pos: findPlaceCenter(place),
  };
}

function describeEntityCandidate(state: WorldState, entity: Entity): WalkCandidate | null {
  if (entity.location.kind !== "tile") return null;
  return {
    name: describeEntityName(state, entity),
    destination: { kind: "entity", entityId: entity.id },
    placeName: entity.location.place,
    pos: entity.location.pos,
  };
}

/**
 * The map's fixed objects anywhere, which an agent can find by name like a place. Loose items
 * and creatures are left out: where they are now is known only by seeing them.
 */
function listMapObjects(state: WorldState): Entity[] {
  return state.entities.filter(
    (entity) =>
      entity.location.kind === "tile" && entity.label !== null && !isCreature(state, entity),
  );
}

function listCandidates(state: WorldState, agent: Agent): WalkCandidate[] {
  const entities = new Map<string, Entity>();
  for (const entity of [...listHereEntities(state, agent), ...listMapObjects(state)]) {
    entities.set(entity.id, entity);
  }
  const entityCandidates = [...entities.values()].flatMap(
    (entity) => describeEntityCandidate(state, entity) ?? [],
  );
  return [
    ...state.map.places.map(describePlaceCandidate),
    ...listOutdoorSpotCandidates(state),
    ...entityCandidates,
  ];
}

function listOutdoorSpotCandidates(state: WorldState): WalkCandidate[] {
  return listOutdoorSpots(state.map).map((spot) => ({
    name: spot.name,
    destination: { kind: "tile", pos: spot.pos, name: spot.name },
    placeName: config.map.defaultOutdoorPlace,
    pos: spot.pos,
  }));
}

function compareRanked(first: RankedCandidate, second: RankedCandidate): number {
  if (first.score !== second.score) return second.score - first.score;
  if (first.isInSeenPlace !== second.isInSeenPlace) return first.isInSeenPlace ? -1 : 1;
  return first.distance - second.distance;
}

/** The place or map object whose name is most like the wanted one; null when none is near. */
function findClosestNamed(state: WorldState, agent: Agent, wanted: string): WalkDestination | null {
  const seenPlaceNames = new Set(agent.seenPlaces.map((seenPlace) => seenPlace.name));
  const ranked = listCandidates(state, agent)
    .map((candidate) => ({
      candidate,
      score: scoreNameMatch(wanted, candidate.name),
      isInSeenPlace: seenPlaceNames.has(candidate.placeName) || candidate.placeName === agent.place,
      distance: computeChebyshevDistance(agent.pos, candidate.pos),
    }))
    .filter((entry) => entry.score >= config.places.walkNameMatch.minimumScore)
    .sort(compareRanked);
  return ranked[0]?.candidate.destination ?? null;
}

/**
 * Where a `walk_to` name leads: a place, a spot on the road by a place, someone in sight, a thing
 * here, then the place, spot or map object anywhere whose name is most like it. Null only when
 * nothing goes by a name like it.
 */
export function findWalkDestination(
  state: WorldState,
  agent: Agent,
  targetName: string,
): WalkDestination | null {
  const wanted = normalizeDisplayName(targetName);
  if (wanted === "") return null;
  const place = state.map.places.find((area) => normalizeDisplayName(area.name) === wanted);
  if (place) return { kind: "place", placeName: place.name };
  const spot = listOutdoorSpots(state.map).find(
    (candidate) => normalizeDisplayName(candidate.name) === wanted,
  );
  if (spot) return { kind: "tile", pos: spot.pos, name: spot.name };
  const otherId = resolveName(targetName, listOthersAsSeen(state, agent.id));
  if (otherId) return { kind: "agent", agentId: otherId };
  const here = listHereEntities(state, agent).find(
    (entity) => normalizeDisplayName(describeEntityName(state, entity)) === wanted,
  );
  if (here) return { kind: "entity", entityId: here.id };
  return findClosestNamed(state, agent, wanted);
}
