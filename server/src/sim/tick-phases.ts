import type { Needs } from "@village/shared";
import { config } from "../config";
import { applyCrowdEffect, decayNeeds, findCrossedThresholds } from "../economy/needs";
import { advanceSleep, findWakeReason, isAsleep } from "../economy/sleep";
import { mergeAwareness, observeAgents } from "../perception/awareness";
import { canInterrupt, detectNewPerceptions } from "../perception/interrupts";
import {
  computeStarvationDamage,
  isDead,
  regenerateHealth,
  trackStarvation,
} from "../status/health";
import { findEntity, replaceEntity } from "../items/entity-store";
import { countWholeStock, regrowStocks } from "../items/stock";
import { wakeAgent } from "./action-stopping";
import { advanceConditions } from "./conditions";
import { applyDamage } from "./damage";
import { WAIT_ACTION, WALK_ACTION, describeDoing } from "./action-phrases";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import type { TickContext } from "./tick-context";
import type { WorldState } from "./world-state";
import { finishRunningVerb } from "./verb-runner";
import { advanceWalk } from "./walking";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  listLivingAgents,
  listVisibleAgentIds,
  markAgentChanged,
  markEntityChanged,
  replaceAgent,
  toPerceiver,
} from "./world-access";

const { minutesPerTick } = config.clock;

/**
 * Phase 1: stocks regrow; conditions run their minutes or run out (reactions resolve as their
 * stimuli arrive); for the living, needs decay (slower asleep), sleepers recover, crowds
 * affect the awake, health regenerates, and starvation does damage after its grace period.
 */
export function applyMechanics(context: TickContext): Map<string, Needs> {
  const { state } = context;
  for (const regrown of regrowStocks(state.entities, state.items, minutesPerTick)) {
    const before = findEntity(state, regrown.id);
    replaceEntity(state, regrown);
    // Fractions grow every tick; viewers only need to hear when a whole unit is back.
    if (countWholeStock(before) !== countWholeStock(regrown)) {
      markEntityChanged(context.result, regrown.id);
    }
  }
  advanceConditions(context);
  const world = buildPerceptionWorld(state);
  const needsBefore = new Map<string, Needs>();
  for (const agentId of listLivingAgents(state).map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    needsBefore.set(agentId, agent.needs);
    const isSleeping = isAsleep(agent);
    let updated = decayNeeds(agent, { isAsleep: isSleeping, minutesPerTick });
    updated = isSleeping
      ? advanceSleep(updated, minutesPerTick)
      : applyCrowdEffect(updated, listVisibleAgentIds(state, world, agent).length);
    updated = trackStarvation(updated, state.tick);
    updated = regenerateHealth(updated, { isAsleep: isSleeping, minutesPerTick });
    replaceAgent(state, updated);
    applyDamage(context, agentId, {
      amount: computeStarvationDamage(updated, state.tick, minutesPerTick),
      killed: config.health.starvationKilledPhrase,
      sourceAgentId: null,
    });
  }
  return needsBefore;
}

function hasEnded(endsAtTick: number | null, tick: number): boolean {
  return endsAtTick !== null && tick >= endsAtTick;
}

/** Phase 2: walks step, verbs finish, sleepers wake on their own, waits run out. */
export function progressActions(context: TickContext): void {
  const { state, result } = context;
  for (const agentId of state.agents.map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    const action = agent.currentAction;
    if (action === null || isDead(agent)) continue;
    if (action.kind === WALK_ACTION && getAgentRuntime(state, agentId).walk) {
      advanceWalk(context, agentId);
    } else if (isAsleep(agent)) {
      if (findWakeReason(agent, state.tick) !== null) wakeAgent(context, agentId);
    } else if (action.verb !== undefined) {
      if (hasEnded(action.endsAtTick, state.tick)) finishRunningVerb(context, agentId);
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
  for (const agentId of listLivingAgents(state).map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    const runtime = getAgentRuntime(state, agentId);
    const sighted = observeAgents(world, toPerceiver(agent), observed, state.tick);
    replaceAgent(state, { ...agent, awareness: mergeAwareness(agent.awareness, sighted) });
    const visibleIds = listVisibleAgentIds(state, world, agent);
    const newlyVisible = detectNewPerceptions(runtime.visibleAgentIds, visibleIds);
    if (newlyVisible.length > 0) {
      const names = newlyVisible
        .map((otherId) => describeAgentAsSeen(findAgent(state, otherId)))
        .join(", ");
      requestDecision(runtime, `${names} came into view`, false);
    }
    runtime.visibleAgentIds = visibleIds;
  }
}

/** Phase 4: a need that dropped below the decision threshold this tick gives a decision. */
export function flagCrossedNeeds(context: TickContext, needsBefore: Map<string, Needs>): void {
  for (const agent of listLivingAgents(context.state)) {
    const before = needsBefore.get(agent.id);
    if (!before) continue;
    const crossed = findCrossedThresholds(before, agent.needs);
    if (crossed.length === 0) continue;
    requestDecision(getAgentRuntime(context.state, agent.id), `my ${crossed.join(" and ")}`, true);
  }
}

/**
 * Rolls in [0, 1) for whether recall fails, drawn while requests are picked in agent order, so the
 * seeded sequence doesn't depend on which LLM call returns first.
 */
export interface RecallRolls {
  /** For the memories that come to mind on their own. */
  passive: number;
  /** For a `recall` action. */
  explicit: number;
}

export interface DecisionRequest {
  agentId: string;
  /** Interrupted while doing something, so `continue` is offered. */
  isMidActionInterrupt: boolean;
  recallRolls: RecallRolls;
}

function rollRecall(state: WorldState): RecallRolls {
  return { passive: state.random.next(), explicit: state.random.next() };
}

/**
 * Phase 5a: who decides this tick. No action means a decision; otherwise an urgent flag (own
 * name, conversation, woken, need, handed something) or a perception flag outside the cooldown.
 * Every flag is consumed here, so flags raised later in the tick count for the next tick. An agent
 * still waiting on a decision is skipped and keeps its flag for after that decision lands.
 */
export function selectDecisionRequests(
  context: TickContext,
  isAgentDeciding: (agentId: string) => boolean = () => false,
): DecisionRequest[] {
  const { state } = context;
  const requests: DecisionRequest[] = [];
  for (const agent of listLivingAgents(state)) {
    if (isAgentDeciding(agent.id)) continue;
    const runtime = getAgentRuntime(state, agent.id);
    const pending = runtime.pendingDecision;
    runtime.pendingDecision = null;
    const isMidActionInterrupt = agent.currentAction !== null;
    if (agent.currentAction === null || pending?.isUrgent) {
      requests.push({ agentId: agent.id, isMidActionInterrupt, recallRolls: rollRecall(state) });
    } else if (pending && canInterrupt(runtime.lastInterruptTick, state.tick)) {
      runtime.lastInterruptTick = state.tick;
      requests.push({ agentId: agent.id, isMidActionInterrupt, recallRolls: rollRecall(state) });
    }
  }
  return requests;
}
