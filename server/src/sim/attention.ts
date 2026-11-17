import type { Agent, WorldEvent } from "@village/shared";
import { config } from "../config";
import { findEntityIfPresent } from "../items/entity-store";
import type { EventPerception } from "../perception/types";
import { describeLocation } from "../world/place-names";
import type { WorldState } from "./world-state";

/*
 * Whether something an awake agent perceived, short of urgent, turns its head. A notable event
 * gives a decision within the interrupt cooldown; a background one never does. Either way it is
 * filed in the agent's stream, so the agent remembers it.
 */

function isLoudEnoughToNotice(event: WorldEvent): boolean {
  return event.loudness !== null && event.loudness >= config.attention.noticeLoudness;
}

/** Clear speech always turns heads; a muffled voice only when loud; speech seen but unheard never. */
function isNotableSpeech(event: WorldEvent, perception: EventPerception): boolean {
  if (perception.hearing === "clear") return true;
  return perception.hearing === "muffled" && isLoudEnoughToNotice(event);
}

/** The event is aimed at the agent, or at something the agent carries. */
function isAimedAt(state: WorldState, event: WorldEvent, agentId: string): boolean {
  if (event.targetId === null) return false;
  if (event.targetId === agentId) return true;
  const target = findEntityIfPresent(state, event.targetId);
  return target?.location.kind === "inside" && target.location.holderId === agentId;
}

function isArrivalWhereAgentIs(state: WorldState, event: WorldEvent, agent: Agent): boolean {
  if (event.kind !== "arrived") return false;
  const arrivedAt = describeLocation(state.map, event.place, event.pos);
  return arrivedAt === describeLocation(state.map, agent.place, agent.pos);
}

function isNoticedVerb(state: WorldState, event: WorldEvent): boolean {
  return event.verb !== undefined && (state.items.world.noticedVerbs ?? []).includes(event.verb);
}

/** Whether a non-urgent event the agent took in is notable rather than background. */
export function isNotable(
  state: WorldState,
  event: WorldEvent,
  perception: EventPerception,
  agent: Agent,
): boolean {
  if (event.speech !== undefined) return isNotableSpeech(event, perception);
  if (isAimedAt(state, event, agent.id) || isLoudEnoughToNotice(event)) return true;
  if (!config.attention.backgroundEventKinds.includes(event.kind)) return true;
  return isArrivalWhereAgentIs(state, event, agent) || isNoticedVerb(state, event);
}
