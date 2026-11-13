import { completeNextStep } from "../memory/plans";
import { findDefinition, type Agent, type AgentThought, type DecisionReply } from "@village/shared";
import { config } from "../config";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance, executeGive } from "../economy/give";
import { describeEntityName, listTileEntitiesAt } from "../items/entity-store";
import { fileOwnNote } from "../memory/filing";
import { pushWorkingMemory } from "../memory/working-memory";
import { isDead } from "../status/health";
import { WAIT_ACTION } from "./action-phrases";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime } from "./agent-runtime";
import type { DecidedReply, DecisionPlan, PlannedAction } from "./decision-runner";
import { broadcastEvent } from "./event-broadcast";
import { createEvent, createSpeechEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { startOrApproachVerb } from "./verb-approach";
import { startWalk } from "./walk-start";
import {
  describeAgentAsSeen,
  findAgent,
  listKnownNames,
  listOthersAsSeen,
  markAgentChanged,
  markEntityChanged,
  rememberBriefly,
  replaceAgent,
} from "./world-access";

const { minutesPerTick } = config.clock;

function chooseLastThought(agent: Agent, reply: DecisionReply, tick: number): AgentThought | null {
  const text = reply.thought.trim();
  return text ? { text, tick } : agent.lastThought;
}

/** intention, mood and stepDone: free mental acts that ride along with any action. */
function applyFreeActs(context: TickContext, agentId: string, decided: DecidedReply): void {
  const { state } = context;
  const { reply } = decided;
  const agent = findAgent(state, agentId);
  replaceAgent(state, {
    ...agent,
    intention: reply.intention || agent.intention,
    mood: reply.mood ?? agent.mood,
    plans:
      reply.stepDone === undefined ? agent.plans : completeNextStep(agent.plans, reply.stepDone),
    lastThought: chooseLastThought(agent, reply, state.tick),
  });
}

function startWait(context: TickContext, agentId: string, minutes: number): void {
  const clamped = Math.min(Math.max(minutes, minutesPerTick), config.decision.maxWaitMinutes);
  const agent = findAgent(context.state, agentId);
  const endsAtTick = context.state.tick + Math.max(1, Math.ceil(clamped / minutesPerTick));
  replaceAgent(context.state, { ...agent, currentAction: { kind: WAIT_ACTION, endsAtTick } });
  markAgentChanged(context.result, agentId);
}

/** Speaks, then stays to hear an answer; anything newly noticed ends the wait early. */
function executeSay(
  context: TickContext,
  agentId: string,
  action: Extract<PlannedAction, { kind: "say" }>,
): void {
  const { state } = context;
  const speech = createSpeechEvent(state, findAgent(state, agentId), action.line, action.origin);
  broadcastEvent(state, speech, context.result);
  startWait(context, agentId, action.minutes);
}

function executeWalk(context: TickContext, agentId: string, targetName: string): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const wanted = normalizeDisplayName(targetName);
  const place = state.map.places.find((area) => normalizeDisplayName(area.name) === wanted);
  if (place) {
    if (agent.place === place.name) {
      failAction(state, result, agentId, `walk to the ${place.name}`, "I was already there");
    } else {
      startWalk(context, agentId, { kind: "place", placeName: place.name }, null);
    }
    return;
  }
  const otherId = resolveName(targetName, listOthersAsSeen(state, agentId));
  if (otherId) {
    const other = findAgent(state, otherId);
    if (computeChebyshevDistance(agent.pos, other.pos) <= config.economy.giveReachTiles) {
      failAction(
        state,
        result,
        agentId,
        `walk over to ${describeAgentAsSeen(other)}`,
        "I was already right next to them",
      );
    } else {
      startWalk(context, agentId, { kind: "agent", agentId: otherId }, null);
    }
    return;
  }
  const entity = listTileEntitiesAt(state, agent.place).find(
    (candidate) => normalizeDisplayName(describeEntityName(state, candidate)) === wanted,
  );
  if (entity) {
    startWalk(context, agentId, { kind: "entity", entityId: entity.id }, null);
    return;
  }
  failAction(state, result, agentId, `walk to ${targetName}`, "I don't know how to get there");
}

function executeGiveAction(
  context: TickContext,
  agentId: string,
  action: Extract<PlannedAction, { kind: "give" }>,
): void {
  const { state, result } = context;
  const giver = findAgent(state, agentId);
  const what = `${action.amount} ${action.item.trim().toLowerCase()}`;
  const recipientId = resolveName(action.target, listOthersAsSeen(state, agentId));
  if (!recipientId) {
    failAction(
      state,
      result,
      agentId,
      `hand ${what} to ${action.target}`,
      "there was no one by that name",
    );
    return;
  }
  const recipient = findAgent(state, recipientId);
  if (isDead(recipient)) {
    const recipientName = describeAgentAsSeen(recipient);
    failAction(
      state,
      result,
      agentId,
      `hand ${what} to ${recipientName}`,
      "a body can't take anything",
    );
    return;
  }
  const given = executeGive(state, {
    giver,
    recipient,
    itemName: action.item,
    amount: action.amount,
  });
  if (!given.isSuccess) {
    failAction(state, result, agentId, `hand ${recipient.name} ${what}`, given.reason);
    return;
  }
  for (const entityId of given.movedEntityIds) markEntityChanged(result, entityId);
  markAgentChanged(result, agentId);
  markAgentChanged(result, recipientId);
  const event = createEvent(state, giver, {
    kind: "gave",
    description: `gave ${recipient.name} ${given.description}`,
    targetId: recipientId,
    targetName: recipient.name,
    item: findDefinition(state.items, given.definitionId).name,
    amount: given.amount,
    itemText: given.description,
  });
  broadcastEvent(state, event, result);
}

function executeAction(context: TickContext, agentId: string, action: PlannedAction): void {
  switch (action.kind) {
    case "walk_to":
      return executeWalk(context, agentId, action.target);
    case "interact":
      return startOrApproachVerb(context, agentId, action.request);
    case "give":
      return executeGiveAction(context, agentId, action);
    case "say":
      return executeSay(context, agentId, action);
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
  rememberBriefly(state, agentId, note);
  const memory = fileOwnNote(
    agentId,
    note,
    state.tick,
    state.memoryStore,
    state.memoryIds,
    listKnownNames(state),
  );
  if (memory) state.memoryStore.add(memory);
}

/**
 * Applies one decision: free acts, recall results into working memory, notes of names that
 * weren't found,
 * then the act itself. Choosing anything but `continue` stops the current action first.
 */
export function applyDecisionPlan(context: TickContext, plan: DecisionPlan): void {
  const { state, result } = context;
  const { agentId } = plan;
  // A reply for someone who died since it was asked for (or earlier in this tick) is dropped.
  if (isDead(findAgent(state, agentId))) return;
  const isContinuing =
    plan.action.kind === "continue" && findAgent(state, agentId).currentAction !== null;
  if (!isContinuing) stopCurrentAction(context, agentId);
  for (const reply of plan.replies) applyFreeActs(context, agentId, reply);
  if (plan.recallEntries.length > 0) {
    const agent = findAgent(state, agentId);
    const workingMemory = plan.recallEntries.reduce(
      (entries, entry) => pushWorkingMemory(entries, entry),
      agent.workingMemory,
    );
    replaceAgent(state, { ...agent, workingMemory });
  }
  const runtime = getAgentRuntime(state, agentId);
  runtime.lastFailure = null;
  for (const note of plan.unknownNameNotes) noteUnknownName(context, agentId, note);
  markAgentChanged(result, agentId);
  result.decidedAgentIds.push(agentId);
  if (isContinuing) return;
  const action: PlannedAction =
    plan.action.kind === "continue"
      ? { kind: "wait", minutes: config.decision.defaultWaitMinutes }
      : plan.action;
  executeAction(context, agentId, action);
}
