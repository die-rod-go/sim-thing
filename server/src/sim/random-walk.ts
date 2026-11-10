import type { Agent, Position, WorldEvent, WorldEventKind } from "@village/shared";
import { findPlaceAt } from "../world/map-loader";
import { findPathToPlace } from "../world/pathfinding";
import type { AdvanceTick } from "./loop";
import {
  createEmptyTickResult,
  takeNextEventId,
  type TickResult,
  type WorldState,
} from "./world-state";

const WALK_ACTION = "walk_to";

interface PlannedWalk {
  placeName: string;
  remainingSteps: Position[];
}

function isNextStepAdjacent(agent: Agent, walk: PlannedWalk): boolean {
  const nextStep = walk.remainingSteps[0];
  if (!nextStep) return false;
  return Math.abs(nextStep.x - agent.pos.x) + Math.abs(nextStep.y - agent.pos.y) === 1;
}

function buildWalkEvent(
  state: WorldState,
  agent: Agent,
  kind: WorldEventKind,
  placeName: string,
): WorldEvent {
  return {
    id: takeNextEventId(state),
    tick: state.tick,
    actorId: agent.id,
    actorName: agent.name,
    kind,
    targetId: null,
    targetName: placeName,
    place: agent.place,
    pos: { ...agent.pos },
    description:
      kind === "walk_started"
        ? `started walking to the ${placeName}`
        : `arrived at the ${placeName}`,
    loudness: null,
  };
}

/**
 * The Milestone 1 placeholder for decisions: each agent picks a random place, walks there one tile
 * per tick, then picks another. Paths live in this strategy, not the world, so a resumed world
 * simply replans from the agent's current action.
 */
export function createRandomWalkStrategy(): AdvanceTick {
  const walks = new Map<string, PlannedWalk>();

  function planWalk(state: WorldState, agent: Agent, result: TickResult): void {
    const candidatePlaces = state.map.places.filter((place) => place.name !== agent.place);
    if (candidatePlaces.length === 0) return;
    const placeName = state.random.pick(candidatePlaces).name;
    const path = findPathToPlace(state.map, agent.pos, placeName);
    if (path === null || path.length === 0) return;
    walks.set(agent.id, { placeName, remainingSteps: path });
    agent.currentAction = { kind: WALK_ACTION, target: placeName, endsAtTick: null };
    result.events.push(buildWalkEvent(state, agent, "walk_started", placeName));
    result.changedAgentIds.push(agent.id);
  }

  function resumeWalk(state: WorldState, agent: Agent): PlannedWalk | null {
    const placeName = agent.currentAction?.target;
    if (agent.currentAction?.kind !== WALK_ACTION || placeName === undefined) return null;
    const known = walks.get(agent.id);
    if (known && known.placeName === placeName && isNextStepAdjacent(agent, known)) return known;
    const path = findPathToPlace(state.map, agent.pos, placeName);
    if (path === null || path.length === 0) return null;
    const replanned = { placeName, remainingSteps: path };
    walks.set(agent.id, replanned);
    return replanned;
  }

  function stepAgent(state: WorldState, agent: Agent, result: TickResult): void {
    const walk = resumeWalk(state, agent);
    if (walk === null) {
      if (agent.currentAction !== null) {
        agent.currentAction = null;
        result.changedAgentIds.push(agent.id);
      }
      planWalk(state, agent, result);
      return;
    }
    const nextStep = walk.remainingSteps.shift();
    if (!nextStep) return;
    agent.pos = nextStep;
    agent.place = findPlaceAt(state.map, nextStep);
    result.moves.push({ agentId: agent.id, pos: { ...nextStep }, place: agent.place });
    if (walk.remainingSteps.length === 0) {
      walks.delete(agent.id);
      agent.currentAction = null;
      result.events.push(buildWalkEvent(state, agent, "arrived", walk.placeName));
      result.changedAgentIds.push(agent.id);
    }
  }

  return (state) => {
    const result = createEmptyTickResult(state.tick);
    for (const agent of state.agents) stepAgent(state, agent, result);
    return Promise.resolve(result);
  };
}
