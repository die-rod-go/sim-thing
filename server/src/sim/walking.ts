import type { Agent, Position, Verb } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import {
  describeEntityName,
  findEntityIfPresent,
  getDefinition,
  listTileEntitiesAt,
  replaceEntity,
  resolveEntityPosition,
} from "../items/entity-store";
import { describePlace, fileFirstVisit } from "../memory/filing";
import { canSee } from "../perception/sight";
import { findPlaceAt } from "../world/map-loader";
import { findPathToAny, findPathToPlace, findPathToTile } from "../world/pathfinding";
import { WALK_ACTION } from "./action-phrases";
import { describeAttempt } from "./action-phrases";
import {
  getAgentRuntime,
  type PendingVerb,
  type UsedThing,
  type WalkDestination,
} from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { findVerbByName, listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { isDead } from "../status/health";
import { computeVerbReach, describeAimName, findAimProblem, isAimInReach } from "./verb-aim";
import { startVerbNow } from "./verb-runner";
import {
  buildPerceptionWorld,
  buildWalkingGrid,
  findAgent,
  markAgentChanged,
  markEntityChanged,
  rememberBriefly,
  replaceAgent,
} from "./world-access";
import type { WorldState } from "./world-state";

const SURROUNDING_OFFSETS: readonly Position[] = [-1, 0, 1].flatMap((offsetY) =>
  [-1, 0, 1].map((offsetX) => ({ x: offsetX, y: offsetY })),
);

function computePath(
  state: WorldState,
  from: Position,
  destination: WalkDestination,
): Position[] | null {
  const grid = buildWalkingGrid(state);
  if (destination.kind === "place") {
    return findPathToPlace(state.map, grid, from, destination.placeName);
  }
  if (destination.kind === "entity") {
    const entity = findEntityIfPresent(state, destination.entityId);
    const position = entity ? resolveEntityPosition(state, entity) : null;
    return position ? findPathToTile(grid, from, position.pos) : null;
  }
  const other = findAgent(state, destination.agentId);
  const goals = SURROUNDING_OFFSETS.map((offset) => ({
    x: other.pos.x + offset.x,
    y: other.pos.y + offset.y,
  }));
  return findPathToAny(grid, from, goals);
}

function describeEntityDestination(state: WorldState, entityId: string): string | null {
  const entity = findEntityIfPresent(state, entityId);
  return entity ? describeEntityName(state, entity) : null;
}

function describeDestination(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return describePlace(destination.placeName);
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return `the ${describeEntityDestination(state, destination.entityId) ?? "spot"}`;
}

function destinationName(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return destination.placeName;
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return describeEntityDestination(state, destination.entityId) ?? "";
}

/**
 * Starts a walk. Returns false (after filing the failure) when there is no way there. An empty
 * path means the agent is already there, which the caller handles.
 */
export function startWalk(
  context: TickContext,
  agentId: string,
  destination: WalkDestination,
  pendingVerb: PendingVerb | null,
): boolean {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const path = computePath(state, agent.pos, destination);
  const where = describeDestination(state, destination);
  if (path === null) {
    failAction(state, result, agentId, `walk to ${where}`, "I couldn't find a way there");
    return false;
  }
  const name = destinationName(state, destination);
  const isChase = destination.kind === "agent" && pendingVerb?.aim !== undefined;
  const walking: Agent = {
    ...agent,
    currentAction: { kind: WALK_ACTION, target: name, endsAtTick: null },
  };
  replaceAgent(state, walking);
  getAgentRuntime(state, agentId).walk = {
    destination,
    remainingSteps: path,
    pendingVerb,
    ...(isChase ? { giveUpAtTick: state.tick + path.length + config.combat.chaseTicks } : {}),
  };
  markAgentChanged(result, agentId);
  const towards = destination.kind === "agent" ? `towards ${name}` : `to ${where}`;
  broadcastEvent(
    state,
    createEvent(state, walking, {
      kind: "walk_started",
      description: `started walking ${towards}`,
      targetId: destination.kind === "agent" ? destination.agentId : null,
      targetName: name,
    }),
    result,
  );
  return true;
}

/** Walking into a closed door (anything `openable`) opens it in passing. */
function openDoorOnTile(context: TickContext, agent: Agent, tile: Position): void {
  const { state, result } = context;
  const door = state.entities.find(
    (entity) =>
      entity.state.isOpen === false &&
      entity.location.kind === "tile" &&
      entity.location.pos.x === tile.x &&
      entity.location.pos.y === tile.y,
  );
  if (!door) return;
  replaceEntity(state, { ...door, state: { ...door.state, isOpen: true } });
  markEntityChanged(result, door.id);
  const doorName = describeEntityName(state, door);
  const event = createEvent(state, agent, {
    kind: "action_finished",
    description: config.doors.openedInPassingPhrase.split("{item}").join(doorName),
    targetId: door.id,
    targetName: doorName,
    loudness: config.doors.openedInPassingLoudness,
  });
  broadcastEvent(state, event, result);
}

function noteFirstVisit(context: TickContext, agentId: string, place: string): void {
  const { state } = context;
  const runtime = getAgentRuntime(state, agentId);
  const isMapPlace = state.map.places.some((area) => area.name === place);
  if (!isMapPlace || runtime.visitedPlaces.includes(place)) return;
  runtime.visitedPlaces.push(place);
  const objectNames = listTileEntitiesAt(state, place)
    .filter((entity) => !Object.hasOwn(getDefinition(state, entity).components, "openable"))
    .map((entity) => describeEntityName(state, entity));
  const memory = fileFirstVisit(agentId, place, objectNames, state.tick, state.memoryIds);
  state.memoryStore.add(memory);
  rememberBriefly(state, agentId, memory.text);
}

function stepOnce(context: TickContext, agentId: string, nextStep: Position): void {
  const { state, result } = context;
  openDoorOnTile(context, findAgent(state, agentId), nextStep);
  const agent = findAgent(state, agentId);
  const place = findPlaceAt(state.map, nextStep);
  replaceAgent(state, { ...agent, pos: { ...nextStep }, place });
  result.moves.push({ agentId, pos: { ...nextStep }, place });
  if (place !== agent.place) {
    markAgentChanged(result, agentId);
    noteFirstVisit(context, agentId, place);
  }
}

function describePendingAttempt(state: WorldState, agentId: string, pending: PendingVerb): string {
  const used = pending.used;
  const usedEntity =
    used?.kind === "entity" ? findEntityIfPresent(state, used.entityId) : undefined;
  return describeAttempt(state.items, pending.verb, {
    item: usedEntity ? describeEntityName(state, usedEntity) : "",
    target: pending.aim ? describeAimName(state, agentId, pending.aim) : undefined,
  });
}

/**
 * On the way to an aimed verb's target: start as soon as it is in reach and sight, give up on a
 * dead target, or once a moving one has been followed for too long. True when the walk is over.
 */
function pursueAim(context: TickContext, agentId: string): boolean {
  const { state, result } = context;
  const walk = getAgentRuntime(state, agentId).walk;
  const pending = walk?.pendingVerb;
  if (!walk || !pending?.aim || !pending.used) return false;
  const { aim, used } = pending;
  const problem = findAimProblem(state, agentId, aim);
  const isTargetDead = aim.kind === "agent" && isDead(findAgent(state, aim.agentId));
  if (isTargetDead && problem !== null) {
    failAction(state, result, agentId, describePendingAttempt(state, agentId, pending), problem);
    return true;
  }
  const verb = findPendingVerb(state, agentId, pending);
  const reach = verb ? computeVerbReach(state, verb, findUsedDefinitionId(state, used)) : 0;
  if (problem === null && isAimInReach(state, agentId, aim, reach)) {
    walk.pendingVerb = null;
    getAgentRuntime(state, agentId).walk = null;
    startVerbNow(context, agentId, used, pending);
    return true;
  }
  const hasGivenUp = walk.giveUpAtTick !== undefined && state.tick >= walk.giveUpAtTick;
  const isLost = walk.remainingSteps.length === 0 && walk.giveUpAtTick === undefined;
  if (hasGivenUp || isLost) {
    const aimName = describeAimName(state, agentId, aim);
    const reason = problem ?? (hasGivenUp ? `${aimName} got away` : `${aimName} was out of reach`);
    failAction(state, result, agentId, describePendingAttempt(state, agentId, pending), reason);
    return true;
  }
  if (walk.remainingSteps.length === 0) {
    walk.remainingSteps = computePath(state, findAgent(state, agentId).pos, walk.destination) ?? [];
  }
  return false;
}

function findUsedDefinitionId(state: WorldState, used: UsedThing): string | null {
  if (used.kind === "user") return null;
  return findEntityIfPresent(state, used.entityId)?.definitionId ?? null;
}

function findPendingVerb(
  state: WorldState,
  agentId: string,
  pending: PendingVerb,
): Verb | undefined {
  const used = pending.used;
  if (!used || used.kind === "user") return findVerbByName(listItemlessVerbs(state), pending.verb);
  const entity = findEntityIfPresent(state, used.entityId);
  return entity
    ? findVerbByName(listVerbsForEntity(state, agentId, entity), pending.verb)
    : undefined;
}

function arrive(context: TickContext, agentId: string): void {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const walk = runtime.walk;
  if (!walk) return;
  runtime.walk = null;
  const agent = { ...findAgent(state, agentId), currentAction: null };
  replaceAgent(state, agent);
  markAgentChanged(result, agentId);
  const { destination } = walk;
  if (walk.pendingVerb) {
    const used: UsedThing | null =
      walk.pendingVerb.used ??
      (destination.kind === "entity" ? { kind: "entity", entityId: destination.entityId } : null);
    if (used) {
      startVerbNow(context, agentId, used, walk.pendingVerb);
      return;
    }
  }
  const name = destinationName(state, destination);
  let description = `arrived at ${describeDestination(state, destination)}`;
  if (destination.kind === "agent") {
    const other = findAgent(state, destination.agentId);
    const isClose = computeChebyshevDistance(agent.pos, other.pos) <= config.economy.giveReachTiles;
    description = isClose ? `walked up to ${name}` : `walked to where ${name} had been`;
  }
  const event = createEvent(state, agent, {
    kind: "arrived",
    description,
    targetId: destination.kind === "agent" ? destination.agentId : null,
    targetName: name,
  });
  broadcastEvent(state, event, result);
}

function refreshAgentPath(context: TickContext, agentId: string): void {
  const { state } = context;
  const walk = getAgentRuntime(state, agentId).walk;
  if (!walk || walk.destination.kind !== "agent") return;
  const walker = findAgent(state, agentId);
  const other = findAgent(state, walk.destination.agentId);
  const world = buildPerceptionWorld(state);
  if (!canSee(world, walker.pos, other.pos, config.perception.sightRangeTiles)) return;
  walk.remainingSteps = computePath(state, walker.pos, walk.destination) ?? walk.remainingSteps;
}

/**
 * One tile per tick along the stored path, opening closed doors on the way; ends on arrival. A
 * walk towards an aimed verb's target ends as soon as the target is in reach.
 */
export function advanceWalk(context: TickContext, agentId: string): void {
  if (pursueAim(context, agentId)) return;
  refreshAgentPath(context, agentId);
  const walk = getAgentRuntime(context.state, agentId).walk;
  if (!walk) return;
  const nextStep = walk.remainingSteps.shift();
  if (nextStep) stepOnce(context, agentId, nextStep);
  if (pursueAim(context, agentId)) return;
  const isPursuing = walk.pendingVerb?.aim !== undefined && walk.pendingVerb.used !== undefined;
  if (walk.remainingSteps.length === 0 && !isPursuing) arrive(context, agentId);
}
