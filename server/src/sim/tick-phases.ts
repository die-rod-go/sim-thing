import { isBodyInWorld, readAgentHealth, type Needs } from "@village/shared";
import { config } from "../config";
import { applyCrowdEffect, decayNeeds, findCrossedThresholds } from "../economy/needs";
import { advanceSleep, findWakeReason, isAsleep } from "../economy/sleep";
import { mergeAwareness, observeAgents } from "../perception/awareness";
import { canInterrupt, detectNewPerceptions } from "../perception/interrupts";
import {
  computeRegeneration,
  computeStarvationDamage,
  isDead,
  trackStarvation,
} from "../status/health";
import { writeField } from "../items/thing-writes";
import { wakeAgent } from "./action-stopping";
import { WAIT_ACTION, WALK_ACTION, describeDoing } from "./action-phrases";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { EMPTY_PERSON_ENTRY } from "../passes/apply-pass";
import { lookAtPlaces } from "./place-sighting";
import { NO_RULE_CAUSE } from "./rule-cause";
import { expireComponents, runEveryRules } from "./rule-timers";
import type { TickContext } from "./tick-context";
import { resumeRunningVerb } from "./verb-runner";
import { advanceWalk } from "./walking";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  listLivingAgents,
  listVisibleAgentIds,
  markAgentChanged,
  replaceAgent,
  toPerceiver,
} from "./world-access";

const { minutesPerTick } = config.clock;

/** Raises or lowers the agent's health field; going under 0 kills, with `killed` as the cause. */
function changeHealth(context: TickContext, agentId: string, change: number, killed = ""): void {
  if (change === 0) return;
  const { state } = context;
  const health = readAgentHealth(state.items, findAgent(state, agentId));
  writeField(context, { kind: "agent", agentId }, state.items.world.agentHealth, health + change, {
    ...NO_RULE_CAUSE,
    killed,
  });
}

/**
 * Phase 1: components that ran out are removed, then `every` rules fire (stimulus and `becomes`
 * rules resolve as their causes happen); for the living, needs decay (slower asleep), sleepers
 * recover, crowds affect the awake, health regenerates, and starvation does damage after its
 * grace period.
 */
export function applyMechanics(context: TickContext): Map<string, Needs> {
  const { state } = context;
  expireComponents(context);
  runEveryRules(context, minutesPerTick);
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
    replaceAgent(state, updated);
    changeHealth(
      context,
      agentId,
      computeRegeneration(updated, { isAsleep: isSleeping, minutesPerTick }),
    );
    changeHealth(
      context,
      agentId,
      -computeStarvationDamage(updated, state.tick, minutesPerTick),
      config.health.starvationKilledPhrase,
    );
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
      const wakeReason = findWakeReason(agent, state.tick);
      if (wakeReason !== null) wakeAgent(context, agentId, wakeReason);
    } else if (action.verb !== undefined) {
      if (hasEnded(action.endsAtTick, state.tick)) resumeRunningVerb(context, agentId);
    } else if (action.kind !== WAIT_ACTION || hasEnded(action.endsAtTick, state.tick)) {
      // A wait that ran out, or an action this strategy can't continue (e.g. a stale walk).
      replaceAgent(state, { ...agent, currentAction: null });
      markAgentChanged(result, agentId);
    }
  }
}

/**
 * Phase 3a: everyone's awareness and seen places are refreshed from sight; someone seen for the
 * first time gets an empty person entry; someone newly in view interrupts.
 */
export function updateSight(context: TickContext): void {
  const { state, result } = context;
  const world = buildPerceptionWorld(state);
  const observed = state.agents.filter(isBodyInWorld).map((agent) => ({
    agentId: agent.id,
    pos: agent.pos,
    place: agent.place,
    doing: describeDoing(state, agent, getAgentRuntime(state, agent.id)),
  }));
  for (const agentId of listLivingAgents(state).map((agent) => agent.id)) {
    const agent = findAgent(state, agentId);
    const runtime = getAgentRuntime(state, agentId);
    const sighted = observeAgents(world, toPerceiver(agent), observed, state.tick);
    const places = lookAtPlaces(state, world, agent);
    const visibleIds = listVisibleAgentIds(state, world, agent);
    const firstSeenIds = visibleIds.filter((otherId) => agent.people[otherId] === undefined);
    replaceAgent(state, {
      ...agent,
      awareness: mergeAwareness(agent.awareness, sighted),
      seenPlaces: places.seenPlaces,
      people: {
        ...agent.people,
        ...Object.fromEntries(firstSeenIds.map((otherId) => [otherId, EMPTY_PERSON_ENTRY])),
      },
    });
    if (places.hasNewKnowledge || firstSeenIds.length > 0) markAgentChanged(result, agentId);
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

export interface DecisionRequest {
  agentId: string;
  /** Interrupted while doing something, so `continue` is offered. */
  isMidActionInterrupt: boolean;
  /** What flagged this decision ("Jess came into view"), or null when the agent simply had nothing to do. */
  reason: string | null;
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
    const buildRequest = (): DecisionRequest => ({
      agentId: agent.id,
      isMidActionInterrupt,
      reason: pending?.reason ?? null,
    });
    if (agent.currentAction === null || pending?.isUrgent) {
      requests.push(buildRequest());
    } else if (pending && canInterrupt(runtime.lastInterruptTick, state.tick)) {
      runtime.lastInterruptTick = state.tick;
      requests.push(buildRequest());
    }
  }
  return requests;
}
