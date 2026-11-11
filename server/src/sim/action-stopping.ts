import { endSleep, isAsleep } from "../economy/sleep";
import { findEntityIfPresent, replaceEntity } from "../items/entity-store";
import { removeEntityUser } from "../items/entity-users";
import { getAgentRuntime } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import type { TickContext } from "./tick-context";
import { cancelRunningVerb } from "./verb-runner";
import { findAgent, markAgentChanged, markEntityChanged, replaceAgent } from "./world-access";

/** Ends a sleep: the bed is freed and the agent has no action. Returns the bed's name, if any. */
function leaveBed(context: TickContext, agentId: string): string | null {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const run = runtime.verbRun;
  const bed = run?.usedEntityId ? findEntityIfPresent(state, run.usedEntityId) : undefined;
  if (bed) {
    replaceEntity(state, removeEntityUser(bed, agentId));
    markEntityChanged(result, bed.id);
  }
  runtime.verbRun = null;
  replaceAgent(state, endSleep(findAgent(state, agentId)));
  markAgentChanged(result, agentId);
  return bed && run ? run.usedName : null;
}

/** Wakes a sleeping agent, frees the bed, broadcasts `woke` and tells the reflection hook. */
export function wakeAgent(context: TickContext, agentId: string): void {
  const { state } = context;
  const startedAtTick = getAgentRuntime(state, agentId).verbRun?.startedAtTick ?? state.tick;
  const bedName = leaveBed(context, agentId);
  const description = bedName ? `woke up in the ${bedName}` : "woke up";
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
 * Ends whatever the agent was doing without a word, for an agent who just died: a sleeper's bed
 * and a verb's object (the card table) are freed, nothing is broadcast.
 */
export function abandonCurrentAction(context: TickContext, agentId: string): void {
  const agent = findAgent(context.state, agentId);
  if (isAsleep(agent)) leaveBed(context, agentId);
  else cancelRunningVerb(context, agentId);
  getAgentRuntime(context.state, agentId).walk = null;
}
