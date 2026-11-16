import type { WorldEvent } from "@village/shared";
import { addConversationSocial } from "../economy/needs";
import { isTakingPart, recordSpeech } from "../memory/conversation";
import { fileEvent, type FilingContext } from "../memory/filing";
import { EMPTY_PERSON_ENTRY } from "../passes/apply-pass";
import { awarenessFromPerceptions, mergeAwareness } from "../perception/awareness";
import { perceiveEvent } from "../perception/perceive-event";
import type { EventPerception } from "../perception/types";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import {
  buildPerceptionWorld,
  findAgent,
  listLivingAgents,
  markAgentChanged,
  appendToStream,
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
    conversationLog: state.conversationLog,
    knownAgentIdsByListener: buildKnownVoices(state),
  };
}

/** Every voice is known, so someone heard for the first time gets an empty person entry. */
function mergeHeardAwareness(
  state: WorldState,
  event: WorldEvent,
  perceptions: EventPerception[],
  result: TickResult,
) {
  for (const entry of awarenessFromPerceptions({ event, perceptions })) {
    const perceiver = findAgent(state, entry.perceiverId);
    const heardId = entry.awareness.agentId;
    const isFirstHeard = perceiver.people[heardId] === undefined;
    replaceAgent(state, {
      ...perceiver,
      awareness: mergeAwareness(perceiver.awareness, [entry.awareness]),
      people: isFirstHeard
        ? { ...perceiver.people, [heardId]: EMPTY_PERSON_ENTRY }
        : perceiver.people,
    });
    if (isFirstHeard) markAgentChanged(result, perceiver.id);
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

export const ATTACK_KINDS: readonly WorldEvent["kind"][] = ["attacked", "missed"];
/** The one an offer, its acceptance or its refusal is aimed at gets its decision from the offer itself. */
const OFFER_KINDS: readonly WorldEvent["kind"][] = ["offered", "gave", "declined"];

/**
 * Flags decisions for those who perceived the event; the decision phase applies the cooldown.
 * Being attacked, and seeing an attack or a death, skip it.
 */
function flagDecisions(state: WorldState, event: WorldEvent, perceptions: EventPerception[]): void {
  const isAttack = ATTACK_KINDS.includes(event.kind);
  for (const perception of perceptions) {
    const perceiver = findAgent(state, perception.agentId);
    const runtime = getAgentRuntime(state, perceiver.id);
    if (OFFER_KINDS.includes(event.kind) && event.targetId === perceiver.id) continue;
    if (isAttack && event.targetId === perceiver.id) {
      requestDecision(runtime, `${event.actorName} attacked me`, true);
    } else if (isAttack && perception.isInSight) {
      requestDecision(
        runtime,
        `I saw ${event.actorName} attack ${event.targetName ?? "something"}`,
        true,
      );
    } else if (event.kind === "died" && perception.isInSight) {
      requestDecision(runtime, `I saw ${event.actorName} die`, true);
    } else if (toPerceiver(perceiver).isAsleep) {
      requestDecision(runtime, "a loud sound reached me in my sleep", true);
    } else {
      requestDecision(runtime, "something new caught my attention", false);
    }
  }
}

export interface BroadcastOptions {
  /**
   * Agents who take in nothing of it, even as its actor: a sleeper doesn't perceive the attack that
   * wakes them, and a person the viewer moves doesn't see themselves vanish.
   */
  unperceivedBy?: readonly string[];
}

/**
 * The brief's `broadcast(event)`: works out who perceived it, updates heard awareness and the
 * conversation log, adds it to the stream of the actor and of every perceiver, adds conversation
 * social, and flags who needs a decision because of it.
 */
export function broadcastEvent(
  state: WorldState,
  event: WorldEvent,
  result: TickResult,
  options: BroadcastOptions = {},
): void {
  const world = buildPerceptionWorld(state);
  const unperceivedBy = options.unperceivedBy ?? [];
  const perceptions = perceiveEvent(
    world,
    event,
    listLivingAgents(state)
      .filter((agent) => !unperceivedBy.includes(agent.id))
      .map(toPerceiver),
  );
  const perceived = { event, perceptions };
  mergeHeardAwareness(state, event, perceptions, result);
  if (event.kind === "said") state.conversationLog = recordSpeech(state.conversationLog, perceived);
  for (const filed of fileEvent(perceived, buildFilingContext(state))) {
    if (!unperceivedBy.includes(filed.agentId)) appendToStream(state, filed.agentId, filed.text);
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
