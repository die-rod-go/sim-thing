import { findDefinition, type Agent, type AgentThought, type DecisionReply } from "@village/shared";
import { config } from "../config";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance, executeGive } from "../economy/give";
import {
  describeEntityName,
  listHeldOfDefinition,
  listTileEntitiesAt,
} from "../items/entity-store";
import { findVerbByName, listVerbsForEntity } from "../items/verb-offers";
import { filePersonNote } from "../memory/filing";
import { pushWorkingMemory } from "../memory/working-memory";
import { isDead } from "../status/health";
import { WAIT_ACTION, describeAttempt } from "./action-phrases";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime, type UsedThing } from "./agent-runtime";
import type { DecidedReply, DecisionPlan, PlannedAction, PlannedUse } from "./decision-runner";
import { broadcastEvent } from "./event-broadcast";
import { createEvent, createSpeechEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { startOrApproachVerb } from "./verb-approach";
import { startWalk } from "./walking";
import type { WorldState } from "./world-state";
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

/** intention, mood and note: free mental acts that ride along with any action. */
function applyFreeActs(context: TickContext, agentId: string, decided: DecidedReply): void {
  const { state } = context;
  const { reply } = decided;
  const agent = findAgent(state, agentId);
  replaceAgent(state, {
    ...agent,
    intention: reply.intention || agent.intention,
    mood: reply.mood ?? agent.mood,
    lastThought: chooseLastThought(agent, reply, state.tick),
  });
  if (reply.note) {
    const personId = resolveName(reply.note.person, state.agents);
    const personName = personId ? findAgent(state, personId).name : reply.note.person;
    const memory = filePersonNote(
      agentId,
      personName,
      reply.note.text,
      state.tick,
      state.memoryIds,
      listKnownNames(state),
    );
    state.memoryStore.add(memory);
    rememberBriefly(state, agentId, `I noted: ${memory.text}`);
  }
  if (reply.say) {
    const speech = createSpeechEvent(
      state,
      findAgent(state, agentId),
      { words: reply.say, volume: reply.volume ?? "normal" },
      { thought: reply.thought, llmCallId: decided.llmCallId },
    );
    broadcastEvent(state, speech, context.result);
  }
}

function startWait(context: TickContext, agentId: string, minutes: number): void {
  const clamped = Math.min(Math.max(minutes, minutesPerTick), config.decision.maxWaitMinutes);
  const agent = findAgent(context.state, agentId);
  const endsAtTick = context.state.tick + Math.max(1, Math.ceil(clamped / minutesPerTick));
  replaceAgent(context.state, { ...agent, currentAction: { kind: WAIT_ACTION, endsAtTick } });
  markAgentChanged(context.result, agentId);
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

/** The oldest held item of the planned definition that still offers the verb, if any. */
function findHeldToUse(
  state: WorldState,
  agentId: string,
  use: Extract<PlannedUse, { kind: "held" }>,
  verbName: string,
): string | null {
  const usable = listHeldOfDefinition(state, agentId, use.definitionId).find(
    (entity) => findVerbByName(listVerbsForEntity(state, agentId, entity), verbName) !== undefined,
  );
  return usable?.id ?? null;
}

function toUsedThing(use: Exclude<PlannedUse, { kind: "held" }>): UsedThing {
  if (use.kind === "user") return use;
  if (use.kind === "body") return { kind: "body", agentId: use.agentId };
  return { kind: "entity", entityId: use.entityId };
}

/**
 * Applies interact. A held item is named by definition, so the oldest one that still offers the
 * verb is used; the rest is checked by `startOrApproachVerb`.
 */
function executeInteract(
  context: TickContext,
  agentId: string,
  action: Extract<PlannedAction, { kind: "interact" }>,
): void {
  const { state, result } = context;
  const request = {
    verb: action.verb,
    text: action.text,
    minutes: action.minutes,
    ...(action.chosen ? { chosen: action.chosen } : {}),
  };
  const { use } = action;
  if (use.kind === "held") {
    const entityId = findHeldToUse(state, agentId, use, action.verb);
    if (entityId === null) {
      const attempt = describeAttempt(state.items, action.verb, { item: use.name });
      failAction(state, result, agentId, attempt, `I no longer had any ${use.name}`);
      return;
    }
    const used = { kind: "entity", entityId } as const;
    startOrApproachVerb(context, agentId, used, request, action.targetName);
    return;
  }
  const used = toUsedThing(use);
  startOrApproachVerb(context, agentId, used, request, action.targetName);
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
      return executeInteract(context, agentId, action);
    case "give":
      return executeGiveAction(context, agentId, action);
    case "wait":
      return startWait(context, agentId, action.minutes);
    case "fail":
      return failAction(context.state, context.result, agentId, action.attempt, action.reason);
    case "continue":
      return;
  }
}

/**
 * Applies one decision: free acts (and speech, on this tick), recall results into working memory,
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
  getAgentRuntime(state, agentId).lastFailure = null;
  markAgentChanged(result, agentId);
  result.decidedAgentIds.push(agentId);
  if (isContinuing) return;
  const action: PlannedAction =
    plan.action.kind === "continue"
      ? { kind: "wait", minutes: config.decision.defaultWaitMinutes }
      : plan.action;
  executeAction(context, agentId, action);
}
