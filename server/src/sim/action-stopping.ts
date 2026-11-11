import { endSleep, isAsleep } from "../economy/sleep";
import { findEntityIfPresent } from "../items/entity-store";
import { getAgentRuntime } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import type { TickContext } from "./tick-context";
import { cancelRunningVerb } from "./verb-runner";
import { findAgent, markAgentChanged, replaceAgent } from "./world-access";

/** Ends a sleep: the agent has no action and no longer uses what it slept in. Returns that thing's name, if any. */
function leaveSleepingPlace(context: TickContext, agentId: string): string | null {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const run = runtime.verbRun;
  const sleepingPlace = run?.itemIds[0] ? findEntityIfPresent(state, run.itemIds[0]) : undefined;
  runtime.verbRun = null;
  replaceAgent(state, endSleep(findAgent(state, agentId)));
  markAgentChanged(result, agentId);
  return sleepingPlace && run ? run.itemName : null;
}

/** Wakes a sleeping agent, frees what it slept in, broadcasts `woke` and tells the reflection hook. */
export function wakeAgent(context: TickContext, agentId: string): void {
  const { state } = context;
  const startedAtTick = getAgentRuntime(state, agentId).verbRun?.startedAtTick ?? state.tick;
  const placeName = leaveSleepingPlace(context, agentId);
  const description = placeName ? `woke up in the ${placeName}` : "woke up";
  const awake = findAgent(state, agentId);
  broadcastEvent(state, createEvent(state, awake, { kind: "woke", description }), context.result);
  context.dependencies.reflectionHook.onWoke(
    state,
    agentId,
    state.tick,
    state.tick - startedAtTick,
  );
}

/**
 * Stops whatever the agent is doing because it chose something else: a verb is cancelled with no
 * refund, a sleeper wakes, a walk or wait simply ends.
 */
export function stopCurrentAction(context: TickContext, agentId: string): void {
  const agent = findAgent(context.state, agentId);
  if (isAsleep(agent)) wakeAgent(context, agentId);
  else if (agent.currentAction?.verb !== undefined) cancelRunningVerb(context, agentId);
  getAgentRuntime(context.state, agentId).walk = null;
  const current = findAgent(context.state, agentId);
  if (current.currentAction !== null) {
    replaceAgent(context.state, { ...current, currentAction: null });
    markAgentChanged(context.result, agentId);
  }
}

/**
 * Ends whatever the agent was doing without a word, for an agent who just died: a sleeper's place
 * and a verb's object are left, nothing is broadcast.
 */
export function abandonCurrentAction(context: TickContext, agentId: string): void {
  const agent = findAgent(context.state, agentId);
  if (isAsleep(agent)) leaveSleepingPlace(context, agentId);
  else cancelRunningVerb(context, agentId);
  getAgentRuntime(context.state, agentId).walk = null;
}
