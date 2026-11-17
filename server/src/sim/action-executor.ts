import type { Agent, AgentThought, DecisionReply } from "@village/shared";
import { applyAgendaChanges, replaceAgenda } from "../agenda/agenda";
import { oweTakingStock } from "../memory/summaries";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { isDead } from "../status/health";
import { WAIT_ACTION } from "./action-phrases";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime } from "./agent-runtime";
import type { DecisionPlan, PlannedAction, PlannedSpeech } from "./decision-runner";
import { broadcastEvent } from "./event-broadcast";
import { createSpeechEvent } from "./event-factory";
import { failAction } from "./failure";
import { answerOffer, makeOffer } from "./offers";
import { describeLocation } from "../world/place-names";
import { findWalkDestination } from "./walk-target";
import type { TickContext } from "./tick-context";
import { startOrApproachVerb } from "./verb-approach";
import { markToRemember } from "./key-memories";
import { startWalk } from "./walk-start";
import {
  describeAgentAsSeen,
  findAgent,
  getAgentMemory,
  markAgentChanged,
  appendToStream,
  replaceAgent,
} from "./world-access";

const { minutesPerTick } = config.clock;

function chooseLastThought(agent: Agent, reply: DecisionReply, tick: number): AgentThought | null {
  const text = reply.thought.trim();
  return text ? { text, tick } : agent.lastThought;
}

/**
 * intention, mood, the agenda (a reckoning's whole new list, then done, dropped and added) and
 * remember: free mental acts that ride along with any action. A finished or dropped item and a
 * moment to remember go into the stream in the agent's own words. After a reckoning the agent
 * owes taking stock.
 */
function applyFreeActs(context: TickContext, plan: DecisionPlan): void {
  const { state } = context;
  const { agentId } = plan;
  const { reply } = plan.reply;
  const agent = findAgent(state, agentId);
  const replanned =
    plan.isReckoning && reply.agenda !== undefined ? replaceAgenda(agent, reply.agenda) : agent;
  const planned = applyAgendaChanges(replanned, {
    done: reply.done ?? [],
    dropped: reply.dropped ?? [],
    added: reply.added ?? [],
  });
  replaceAgent(state, {
    ...planned.agent,
    intention: reply.intention || agent.intention,
    mood: reply.mood ?? agent.mood,
    lastThought: chooseLastThought(agent, reply, state.tick),
  });
  for (const text of planned.streamTexts) appendToStream(state, agentId, text);
  if (reply.remember !== undefined) markToRemember(state, agentId, reply.remember);
  if (plan.isReckoning) {
    state.agentMemories[agentId] = oweTakingStock(getAgentMemory(state, agentId));
  }
}

function startWait(context: TickContext, agentId: string, minutes: number): void {
  const clamped = Math.min(Math.max(minutes, minutesPerTick), config.decision.maxWaitMinutes);
  const agent = findAgent(context.state, agentId);
  const endsAtTick = context.state.tick + Math.max(1, Math.ceil(clamped / minutesPerTick));
  replaceAgent(context.state, { ...agent, currentAction: { kind: WAIT_ACTION, endsAtTick } });
  markAgentChanged(context.result, agentId);
}

/** Words go along with any action, so the agent can talk while it walks, works or waits. */
function speak(context: TickContext, agentId: string, speech: PlannedSpeech): void {
  const { state } = context;
  const event = createSpeechEvent(state, findAgent(state, agentId), speech.line, speech.origin);
  broadcastEvent(state, event, context.result);
}

function executeWalk(context: TickContext, agentId: string, targetName: string): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const destination = findWalkDestination(state, agent, targetName);
  if (destination === null) {
    failAction(
      state,
      result,
      agentId,
      `walk to ${targetName}`,
      config.places.unknownWalkTargetReason,
    );
    return;
  }
  if (destination.kind === "place" && agent.place === destination.placeName) {
    failAction(
      state,
      result,
      agentId,
      `walk to the ${destination.placeName}`,
      "I was already there",
    );
    return;
  }
  const isAtSpot =
    destination.kind === "tile" &&
    describeLocation(state.map, agent.place, agent.pos) === destination.name;
  if (isAtSpot) {
    failAction(state, result, agentId, `walk to ${destination.name}`, "I was already there");
    return;
  }
  if (destination.kind === "agent") {
    const other = findAgent(state, destination.agentId);
    if (computeChebyshevDistance(agent.pos, other.pos) <= config.economy.giveReachTiles) {
      failAction(
        state,
        result,
        agentId,
        `walk over to ${describeAgentAsSeen(other)}`,
        "I was already right next to them",
      );
      return;
    }
  }
  startWalk(context, agentId, destination, null);
}

function executeAction(context: TickContext, agentId: string, action: PlannedAction): void {
  switch (action.kind) {
    case "walk_to":
      return executeWalk(context, agentId, action.target);
    case "interact":
      return startOrApproachVerb(context, agentId, action.request);
    case "give":
      return makeOffer(context, agentId, action);
    case "wait":
      return startWait(context, agentId, action.minutes);
    case "continue":
      return;
  }
}

/** Only the agent knows it looked for something that isn't there, so onlookers learn nothing. */
function noteUnknownName(context: TickContext, agentId: string, note: string): void {
  const { state } = context;
  getAgentRuntime(state, agentId).lastFailure = note;
  appendToStream(state, agentId, note);
}

/**
 * Applies one decision: free acts, notes of names that weren't found, the words spoken, the
 * answer to an offer, then the act itself. Choosing anything but `continue` stops the
 * current action first.
 */
export function applyDecisionPlan(context: TickContext, plan: DecisionPlan): void {
  const { state, result } = context;
  const { agentId } = plan;
  // A reply for someone who died since it was asked for (or earlier in this tick) is dropped.
  if (isDead(findAgent(state, agentId))) return;
  const isContinuing =
    plan.action.kind === "continue" && findAgent(state, agentId).currentAction !== null;
  if (!isContinuing) stopCurrentAction(context, agentId);
  applyFreeActs(context, plan);
  const runtime = getAgentRuntime(state, agentId);
  runtime.lastFailure = null;
  for (const note of plan.unknownNameNotes) noteUnknownName(context, agentId, note);
  markAgentChanged(result, agentId);
  result.decidedAgentIds.push(agentId);
  if (plan.speech !== null) speak(context, agentId, plan.speech);
  answerOffer(context, plan);
  if (isContinuing) return;
  const action: PlannedAction =
    plan.action.kind === "continue"
      ? { kind: "wait", minutes: config.decision.defaultWaitMinutes }
      : plan.action;
  executeAction(context, agentId, action);
}
