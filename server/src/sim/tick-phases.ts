import {
  isBodyInWorld,
  readAgentHealth,
  type Agent,
  type Entity,
  type Needs,
} from "@village/shared";

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
import { findEntityIfPresent } from "../items/entity-store";
import { writeField } from "../items/thing-writes";
import { isNoticedOnSight } from "../items/world-physics";
import { wakeAgent } from "./action-stopping";
import { WAIT_ACTION, WALK_ACTION, describeDoing } from "./action-phrases";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { isWaitingForDayPlan } from "./agenda-reminders";
import { EMPTY_PERSON_ENTRY } from "../passes/apply-pass";
import { lookAtPlaces } from "./place-sighting";
import { NO_RULE_CAUSE } from "./rule-cause";
import { expireComponents, runEveryRules } from "./rule-timers";
import type { TickContext } from "./tick-context";
import { describeThingName } from "../items/things";
import type { PerceptionWorld } from "../perception/types";
import { listCreatures } from "./creatures/creature-instincts";
import { listVisibleCreatureIds } from "./creatures/creature-sight";
import { resumeRunningVerb } from "./verb-runner";

import { describePlace } from "../memory/filing";
import { describeLocation } from "../world/place-names";
import { advanceWalk } from "./walking";
import {
  appendToStream,
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
 * first time gets an empty person entry; someone or a creature newly in view interrupts.
 */
export function updateSight(context: TickContext): void {
  const { state, result } = context;
  const world = buildPerceptionWorld(state);
  const creatures = listCreatures(state);
  const observed = state.agents.filter(isBodyInWorld).map((agent) => ({
    agentId: agent.id,
    pos: agent.pos,
    place: describeLocation(state.map, agent.place, agent.pos),
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
    noticeBodies(context, agent, newlyVisible);
    runtime.visibleAgentIds = visibleIds;
    noticeCreatures(context, world, agent, creatures);
  }
}

/**
 * Every body newly in view goes into the stream. One the viewer didn't already know lay dead (from
 * `viewer`'s awareness before this tick's sight) also gives an urgent decision, as seeing a death does.
 */
function noticeBodies(context: TickContext, viewer: Agent, newlyVisibleIds: string[]): void {
  const { state } = context;
  const words = config.death;
  const visibleBodies = newlyVisibleIds
    .map((otherId) => findAgent(state, otherId))
    .filter((other) => isDead(other));
  const isKnownDead = (body: Agent) => viewer.awareness[body.id]?.doing === words.doing;
  for (const body of visibleBodies) {
    const template = isKnownDead(body) ? words.seenBodyEntry : words.foundBodyEntry;
    const entry = template
      .split("{body}")
      .join(describeAgentAsSeen(body))
      .split("{place}")
      .join(describePlace(describeLocation(state.map, body.place, body.pos)));
    appendToStream(state, viewer.id, entry);
  }
  const foundBodies = visibleBodies.filter((body) => !isKnownDead(body));
  if (foundBodies.length === 0) return;
  const bodies = foundBodies.map(describeAgentAsSeen).join(", ");
  const reason = words.foundBodyReason.split("{bodies}").join(bodies);
  requestDecision(getAgentRuntime(state, viewer.id), reason, true, true);
}

/**
 * A creature newly in view that `world.noticeOnSight` matches gives a decision, as a person coming
 * into view does; others come and go unremarked.
 */
function noticeCreatures(
  context: TickContext,
  world: PerceptionWorld,
  agent: Agent,
  creatures: readonly Entity[],
): void {
  const { state } = context;
  const runtime = getAgentRuntime(state, agent.id);
  const visibleIds = listVisibleCreatureIds(state, world, agent, creatures);
  const newlyVisible = detectNewPerceptions(runtime.visibleCreatureIds, visibleIds);
  runtime.visibleCreatureIds = visibleIds;
  const noticed = newlyVisible.filter((entityId) => {
    const creature = findEntityIfPresent(state, entityId);
    return creature !== undefined && isNoticedOnSight(state, creature);
  });
  if (noticed.length === 0) return;
  const names = noticed
    .map((entityId) => describeThingName(state, { kind: "entity", entityId }))
    .join(", ");
  requestDecision(runtime, `${names} came into view`, false);
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
  /** Something significant flagged it: the decision is a reckoning. */
  isReckoning: boolean;
}

/**
 * Phase 5a: who decides this tick. No action means a decision; otherwise an urgent flag (own
 * name, conversation, woken, need, offered something, an agenda item's hour) or a notable flag
 * outside the cooldown. Every flag is consumed here, so flags raised later in the tick count for
 * the next tick. An agent still waiting on a decision, or lying awake waiting for its day plan with
 * nothing urgent, is skipped and keeps its flag for later.
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
    if (isWaitingForDayPlan(state, agent.id) && !runtime.pendingDecision?.isUrgent) continue;
    const pending = runtime.pendingDecision;
    runtime.pendingDecision = null;
    const isMidActionInterrupt = agent.currentAction !== null;
    const buildRequest = (): DecisionRequest => ({
      agentId: agent.id,
      isMidActionInterrupt,
      reason: pending?.reason ?? null,
      isReckoning: pending?.isReckoning ?? false,
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
