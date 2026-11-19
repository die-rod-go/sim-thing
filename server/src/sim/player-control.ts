import type { Agent } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { oweReflection } from "../memory/reflection-progress";
import { isDead } from "../status/health";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import type { PlayerInbox } from "./player-inbox";
import type { TickContext } from "./tick-context";
import { findAgent, getAgentMemory, markAgentChanged, replaceAgent } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * The player takes the agent over: what the LLM had queued and meant to do is dropped, and the
 * clock stops at once so the player can look around. What the agent is in the middle of goes on
 * until the player says otherwise.
 */
function takeOver(context: TickContext, agentId: string): void {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  runtime.queuedActs = [];
  runtime.isAwaitingAnswer = false;
  requestDecision(runtime, config.player.takeOverReason, true);
  replaceAgent(state, { ...findAgent(state, agentId), isPlayed: true, intention: "" });
  markAgentChanged(result, agentId);
}

/**
 * The LLM takes the agent back. It finds what the player did in its stream as its own doings,
 * plans the rest of its day if it is awake, and takes stock of what happened in a reflection.
 */
function handBack(context: TickContext, agentId: string, inbox: PlayerInbox | undefined): void {
  const { state, result } = context;
  inbox?.clear(agentId);
  getAgentRuntime(state, agentId).pendingDecision = null;
  const agent = findAgent(state, agentId);
  replaceAgent(state, { ...agent, isPlayed: false });
  markAgentChanged(result, agentId);
  if (isDead(agent)) return;
  const memory = oweReflection(getAgentMemory(state, agentId));
  state.agentMemories[agentId] = isAsleep(agent)
    ? memory
    : { ...memory, dayPlanOwedSinceTick: state.tick };
}

/** Why the agent can't be played, or null when it can. */
function findPlayRefusal(context: TickContext, agentId: string): string | null {
  const agent = context.state.agents.find((candidate) => candidate.id === agentId);
  if (agent === undefined) return config.player.refusals.unknownAgent;
  if (isDead(agent)) return config.player.refusals.dead.split("{name}").join(agent.name);
  return null;
}

/**
 * Makes `agentId` the one agent the player plays, handing any other back to the LLM; null hands
 * everyone back. Returns why nothing changed, or null.
 */
export function choosePlayedAgent(
  context: TickContext,
  agentId: string | null,
  inbox: PlayerInbox | undefined,
): string | null {
  const refusal = agentId === null ? null : findPlayRefusal(context, agentId);
  if (refusal !== null) return refusal;
  for (const agent of context.state.agents) {
    if (agent.isPlayed && agent.id !== agentId) handBack(context, agent.id, inbox);
  }
  if (agentId !== null && !findAgent(context.state, agentId).isPlayed) takeOver(context, agentId);
  return null;
}

/** The agent the player plays, alive or dead; null when nobody is played. */
export function findPlayedAgent(state: WorldState): Agent | null {
  return state.agents.find((agent) => agent.isPlayed) ?? null;
}
