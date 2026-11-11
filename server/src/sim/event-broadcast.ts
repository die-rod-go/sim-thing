import type { WorldEvent } from "@village/shared";
import { addConversationSocial } from "../economy/needs";
import { isTakingPart, recordSpeech } from "../memory/conversation";
import { fileEvent, type FilingContext } from "../memory/filing";
import { awarenessFromPerceptions, mergeAwareness } from "../perception/awareness";
import { perceiveEvent } from "../perception/perceive-event";
import type { EventPerception } from "../perception/types";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import {
  buildPerceptionWorld,
  findAgent,
  listKnownNames,
  markAgentChanged,
  rememberBriefly,
  replaceAgent,
  toPerceiver,
} from "./world-access";
import type { TickResult, WorldState } from "./world-state";

/**
 * In a village everyone knows everyone's voice, so every listener recognizes every agent heard
 * out of sight. Built per call so agents added later are included.
 */
function buildKnownVoices(state: WorldState): Record<string, string[]> {
  const allIds = state.agents.map((agent) => agent.id);
  return Object.fromEntries(allIds.map((agentId) => [agentId, allIds]));
}

function buildFilingContext(state: WorldState): FilingContext {
  return {
    memories: state.memoryStore,
    idGenerator: state.memoryIds,
    conversationLog: state.conversationLog,
    knownNames: listKnownNames(state),
    knownAgentIdsByListener: buildKnownVoices(state),
  };
}

function mergeHeardAwareness(state: WorldState, event: WorldEvent, perceptions: EventPerception[]) {
  for (const entry of awarenessFromPerceptions({ event, perceptions })) {
    const perceiver = findAgent(state, entry.perceiverId);
    replaceAgent(state, {
      ...perceiver,
      awareness: mergeAwareness(perceiver.awareness, [entry.awareness]),
    });
  }
}

function addSocial(state: WorldState, agentId: string, result: TickResult): void {
  const agent = findAgent(state, agentId);
  replaceAgent(state, { ...agent, needs: addConversationSocial(agent.needs) });
  markAgentChanged(result, agentId);
}

/** Social +1 line for the speaker (if anyone heard) and for every clear listener taking part. */
function applyConversationSocial(
  state: WorldState,
  event: WorldEvent,
  perceptions: EventPerception[],
  result: TickResult,
): void {
  const clearListeners = perceptions.filter((perception) => perception.hearing === "clear");
  if (clearListeners.length > 0) addSocial(state, event.actorId, result);
  for (const listener of clearListeners) {
    if (isTakingPart(state.conversationLog, listener.agentId, event.actorId, event.tick)) {
      addSocial(state, listener.agentId, result);
    }
  }
}

/** Flags decisions for those who perceived the event; the decision phase applies the cooldown. */
function flagDecisions(state: WorldState, event: WorldEvent, perceptions: EventPerception[]): void {
  for (const perception of perceptions) {
    const perceiver = findAgent(state, perception.agentId);
    const runtime = getAgentRuntime(state, perceiver.id);
    if (event.kind === "gave" && event.targetId === perceiver.id) {
      requestDecision(runtime, `${event.actorName} handed me something`, true);
    } else if (toPerceiver(perceiver).isAsleep) {
      requestDecision(runtime, "a loud sound reached me in my sleep", true);
    } else {
      requestDecision(runtime, "something new caught my attention", false);
    }
  }
}

/**
 * The brief's `broadcast(event)`: works out who perceived it, updates heard awareness and the
 * conversation log, files memories for the actor and every perceiver, mirrors them into working
 * memory, adds conversation social, and flags who needs a decision because of it.
 */
export function broadcastEvent(state: WorldState, event: WorldEvent, result: TickResult): void {
  const world = buildPerceptionWorld(state);
  const perceptions = perceiveEvent(world, event, state.agents.map(toPerceiver));
  const perceived = { event, perceptions };
  mergeHeardAwareness(state, event, perceptions);
  if (event.kind === "said") state.conversationLog = recordSpeech(state.conversationLog, perceived);
  for (const memory of fileEvent(perceived, buildFilingContext(state))) {
    state.memoryStore.add(memory);
    rememberBriefly(state, memory.agentId, memory.text);
  }
  if (event.kind === "said") applyConversationSocial(state, event, perceptions, result);
  flagDecisions(state, event, perceptions);
  result.events.push(event);
}

export function broadcastEvents(
  state: WorldState,
  events: readonly WorldEvent[],
  result: TickResult,
): void {
  for (const event of events) broadcastEvent(state, event, result);
}
