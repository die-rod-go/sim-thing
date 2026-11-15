import {
  isEntityId,
  type Agent,
  type Position,
  type StatName,
  type WorldEvent,
} from "@village/shared";
import { config } from "../config";
import { createThingEvent, locateThing, refThingById } from "../items/things";
import { isDead } from "../status/health";
import { getAgentRuntime, getCreatureRuntime, type VerbRun } from "./agent-runtime";
import { createEvent, type EventFields } from "./event-factory";
import type { WorldState } from "./world-state";

/*
 * Who does a verb: an agent, or a creature (an entity acting on its instincts). The verb runner
 * reaches the user only through here, so it never branches on which one it is.
 */

/** The agent doing the verb; null when a creature is. */
export function findUserAgent(state: WorldState, userId: string): Agent | null {
  if (isEntityId(userId)) return null;
  return state.agents.find((agent) => agent.id === userId) ?? null;
}

/** Whether the user can no longer act: a dead agent, or a creature that is gone. */
export function isUserGone(state: WorldState, userId: string): boolean {
  const agent = findUserAgent(state, userId);
  if (agent !== null) return isDead(agent);
  return locateThing(state, refThingById(userId)) === null;
}

export function locateUser(state: WorldState, userId: string): Position {
  const position = locateThing(state, refThingById(userId));
  if (position === null) throw new Error(`The verb user "${userId}" is nowhere`);
  return position.pos;
}

/** An event by the user, at the user's tile. A creature's is seen, never remembered by it. */
export function createUserEvent(
  state: WorldState,
  userId: string,
  fields: EventFields,
): WorldEvent {
  const agent = findUserAgent(state, userId);
  if (agent !== null) return createEvent(state, agent, fields);
  const event = createThingEvent(state, refThingById(userId), fields);
  if (event === null) throw new Error(`The verb user "${userId}" is nowhere`);
  return event;
}

/** The record holding the user's verb in progress. */
export function getUserRuntime(state: WorldState, userId: string): { verbRun: VerbRun | null } {
  return isEntityId(userId) ? getCreatureRuntime(state, userId) : getAgentRuntime(state, userId);
}

/** An agent's own stats; every creature has the same middling ones from the config. */
export function readUserStats(state: WorldState, userId: string): Record<StatName, number> {
  const agent = findUserAgent(state, userId);
  return agent === null ? config.creatures.stats : agent.body;
}
