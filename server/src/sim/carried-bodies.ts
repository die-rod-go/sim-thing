import { isBodyInWorld, type EntityLocation } from "@village/shared";
import { locateThing, refThingById } from "../items/things";
import type { TickContext } from "./tick-context";
import { findAgent, markAgentChanged, replaceAgent } from "./world-access";

/*
 * A dead agent's body can be carried: it is inside a holder, as an entity would be, and keeps its
 * own tile in step with the holder's, so everything that reads where agents are sees it there.
 */

/** Moves the body onto the tile, or inside the holder, that the location names. */
export function placeBody(context: TickContext, agentId: string, location: EntityLocation): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  if (location.kind === "inside") {
    replaceAgent(state, { ...agent, bodyHolderId: location.holderId });
    markAgentChanged(result, agentId);
    carryBodiesAlong(context);
    return;
  }
  const pos = { ...location.pos };
  replaceAgent(state, { ...agent, pos, place: location.place, bodyHolderId: null });
  result.moves.push({ agentId, pos: { ...pos }, place: location.place });
  markAgentChanged(result, agentId);
}

/**
 * Every carried body goes to where its holder now is. One whose holder is gone (buried,
 * destroyed) is let go of where it last was.
 */
export function carryBodiesAlong(context: TickContext): void {
  const { state, result } = context;
  for (const agent of state.agents) {
    if (agent.bodyHolderId === null || !isBodyInWorld(agent)) continue;
    if (locateThing(state, refThingById(agent.bodyHolderId)) === null) {
      replaceAgent(state, { ...agent, bodyHolderId: null });
      markAgentChanged(result, agent.id);
      continue;
    }
    const position = locateThing(state, { kind: "agent", agentId: agent.id });
    if (position === null) continue;
    const hasMoved = position.pos.x !== agent.pos.x || position.pos.y !== agent.pos.y;
    if (!hasMoved && position.place === agent.place) continue;
    const pos = { ...position.pos };
    replaceAgent(state, { ...agent, pos, place: position.place });
    result.moves.push({ agentId: agent.id, pos: { ...pos }, place: position.place });
    if (position.place !== agent.place) markAgentChanged(result, agent.id);
  }
}
