import type { Agent } from "@village/shared";
import { isDead } from "../status/health";
import { WAIT_ACTION } from "./action-phrases";
import { getAgentRuntime, type AgentRuntime } from "./agent-runtime";
import type { PlayerInbox } from "./player-inbox";
import { listLivingAgents } from "./world-access";
import type { WorldState } from "./world-state";

/*
 * The player lives on the agents' clock: the world waits for them where an agent would decide,
 * and runs on while their agent is busy. Walking and working stop only for something urgent; a wait,
 * which is how one listens, also ends on anything notable, like an answer.
 */

function hasFlagThatStops(agent: Agent, runtime: AgentRuntime): boolean {
  const pending = runtime.pendingDecision;
  if (pending === null) return false;
  return pending.isUrgent || agent.currentAction?.kind === WAIT_ACTION;
}

/**
 * Whether the played agent needs its player now: it is alive and idle with nothing queued, or
 * something stops what it is doing. Acts already waiting in the inbox aren't counted here.
 */
export function needsPlayer(state: WorldState, agent: Agent): boolean {
  if (!agent.isPlayed || isDead(agent)) return false;
  const runtime = getAgentRuntime(state, agent.id);
  if (agent.currentAction === null && runtime.queuedActs.length === 0) return true;
  return hasFlagThatStops(agent, runtime);
}

/** Whether the clock must wait for the player before the next tick: their act is still to come. */
export function isWaitingForPlayer(state: WorldState, inbox: PlayerInbox): boolean {
  return listLivingAgents(state).some(
    (agent) => !inbox.hasAny(agent.id) && needsPlayer(state, agent),
  );
}

/**
 * What stopped the clock for the player, as the agent took it in ("Jess said my name"); null when
 * the agent simply has nothing to do.
 */
export function describeTurnReason(state: WorldState, agent: Agent): string | null {
  const runtime = getAgentRuntime(state, agent.id);
  return hasFlagThatStops(agent, runtime) ? (runtime.pendingDecision?.reason ?? null) : null;
}

/**
 * The phase where agents are picked to decide skips the played: a notable flag that won't stop
 * what they are doing is let go, so it can't stop a wait they start later. Everything perceived
 * is in the stream either way.
 */
export function settlePlayerFlag(state: WorldState, agent: Agent): void {
  const runtime = getAgentRuntime(state, agent.id);
  const isIdle = agent.currentAction === null;
  if (isIdle || hasFlagThatStops(agent, runtime)) return;
  runtime.pendingDecision = null;
}
