import type { Needs } from "@village/shared";
import { config } from "../config";
import { applyCrowdEffect, decayNeeds, findCrossedThresholds } from "../economy/needs";
import { regrowStocks } from "../economy/object-state";
import { advanceSleep, findWakeReason, isAsleep } from "../economy/sleep";
import { mergeAwareness, observeAgents } from "../perception/awareness";
import { canInterrupt, detectNewPerceptions } from "../perception/interrupts";
import { WAIT_ACTION, WALK_ACTION, describeDoing } from "./action-phrases";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { finishRunningInteraction, wakeAgent } from "./interaction-runner";
import type { TickContext } from "./tick-context";
import { advanceWalk } from "./walking";
import {
  buildPerceptionWorld,
  findAgent,
  listVisibleAgentIds,
  markAgentChanged,
  replaceAgent,
  toPerceiver,
} from "./world-access";

const { minutesPerTick } = config.clock;

/** Phase 1: stocks regrow; needs decay (slower asleep); sleepers recover; crowds affect the awake. */
export function applyMechanics(context: TickContext): Map<string, Needs> {
  const { state } = context;
  state.objects = regrowStocks(state.objects, minutesPerTick);
  const world = buildPerceptionWorld(state);
  const needsBefore = new Map<string, Needs>();
  for (const agent of [...state.agents]) {
    needsBefore.set(agent.id, agent.needs);
    const isSleeping = isAsleep(agent);
    let updated = decayNeeds(agent, { isAsleep: isSleeping, minutesPerTick });
    updated = isSleeping
      ? advanceSleep(updated, minutesPerTick)
      : applyCrowdEffect(updated, listVisibleAgentIds(state, world, agent).length);
    replaceAgent(state, updated);
  }
  return needsBefore;
}

function hasEnded(endsAtTick: number | null, tick: number): boolean {
  return endsAtTick !== null && tick >= endsAtTick;
}

/** Phase 2: walks step, interactions finish, sleepers wake on their own, waits run out. */
export function progressActions(context: TickContext): void {
  const { state, result } = context;
  for (const agentId of state.agents.map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    const action = agent.currentAction;
    if (action === null) continue;
    if (action.kind === WALK_ACTION && getAgentRuntime(state, agentId).walk) {
      advanceWalk(context, agentId);
    } else if (isAsleep(agent)) {
      if (findWakeReason(agent, state.tick) !== null) wakeAgent(context, agentId);
    } else if (action.interaction !== undefined) {
      if (hasEnded(action.endsAtTick, state.tick)) finishRunningInteraction(context, agentId);
    } else if (action.kind !== WAIT_ACTION || hasEnded(action.endsAtTick, state.tick)) {
      // A wait that ran out, or an action this strategy can't continue (e.g. a stale walk).
      replaceAgent(state, { ...agent, currentAction: null });
      markAgentChanged(result, agentId);
    }
  }
}

/** Phase 3a: everyone's awareness is refreshed from sight; someone newly in view interrupts. */
export function updateSight(context: TickContext): void {
  const { state } = context;
  const world = buildPerceptionWorld(state);
  const observed = state.agents.map((agent) => ({
    agentId: agent.id,
    pos: agent.pos,
    place: agent.place,
    doing: describeDoing(state, agent, getAgentRuntime(state, agent.id)),
  }));
  for (const agentId of state.agents.map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    const runtime = getAgentRuntime(state, agentId);
    const sighted = observeAgents(world, toPerceiver(agent), observed, state.tick);
    replaceAgent(state, { ...agent, awareness: mergeAwareness(agent.awareness, sighted) });
    const visibleIds = listVisibleAgentIds(state, world, agent);
    const newlyVisible = detectNewPerceptions(runtime.visibleAgentIds, visibleIds);
    if (newlyVisible.length > 0) {
      const names = newlyVisible.map((otherId) => findAgent(state, otherId).name).join(", ");
      requestDecision(runtime, `${names} came into view`, false);
    }
    runtime.visibleAgentIds = visibleIds;
  }
}

/** Phase 4: a need that dropped below the decision threshold this tick gives a decision. */
export function flagCrossedNeeds(context: TickContext, needsBefore: Map<string, Needs>): void {
  for (const agent of context.state.agents) {
    const before = needsBefore.get(agent.id);
    if (!before) continue;
    const crossed = findCrossedThresholds(before, agent.needs);
    if (crossed.length === 0) continue;
    requestDecision(getAgentRuntime(context.state, agent.id), `my ${crossed.join(" and ")}`, true);
  }
}

export interface DecisionRequest {
  agentId: string;
  /** Interrupted while doing something, so `continue` is offered. */
  isMidActionInterrupt: boolean;
}

/**
 * Phase 5a: who decides this tick. No action means a decision; otherwise an urgent flag (own
 * name, conversation, woken, need, handed something) or a perception flag outside the cooldown.
 * Every flag is consumed here, so flags raised later in the tick count for the next tick.
 */
export function selectDecisionRequests(context: TickContext): DecisionRequest[] {
  const { state } = context;
  const requests: DecisionRequest[] = [];
  for (const agent of state.agents) {
    const runtime = getAgentRuntime(state, agent.id);
    const pending = runtime.pendingDecision;
    runtime.pendingDecision = null;
    if (agent.currentAction === null) {
      requests.push({ agentId: agent.id, isMidActionInterrupt: false });
    } else if (pending?.isUrgent) {
      requests.push({ agentId: agent.id, isMidActionInterrupt: true });
    } else if (pending && canInterrupt(runtime.lastInterruptTick, state.tick)) {
      runtime.lastInterruptTick = state.tick;
      requests.push({ agentId: agent.id, isMidActionInterrupt: true });
    }
  }
  return requests;
}
