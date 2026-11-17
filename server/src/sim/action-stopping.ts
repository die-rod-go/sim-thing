import { formatDuration } from "@village/shared";
import { config } from "../config";
import { endSleep, isAsleep, type WakeReason } from "../economy/sleep";
import { findEntityIfPresent } from "../items/entity-store";
import { getAgentRuntime } from "./agent-runtime";
import { takeInWaking } from "./agenda-reminders";
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

function fillWakeWords(words: string, placeName: string | null, sleptMinutes: number): string {
  return words
    .split("{place}")
    .join(placeName ? ` in the ${placeName}` : "")
    .split("{slept}")
    .join(formatDuration(sleptMinutes));
}

/**
 * Wakes a sleeping agent, frees what it slept in and broadcasts `woke`; then it takes in what it
 * slept through, and after a long enough sleep owes a day plan.
 * A `reason` is given when the sleep ended on its own. The sleeper's own memory of waking says how
 * long it slept and why it ended, so it can tell whether lying down again would do any good.
 */
export function wakeAgent(context: TickContext, agentId: string, reason?: WakeReason): void {
  const { state } = context;
  const startedAtTick = getAgentRuntime(state, agentId).verbRun?.startedAtTick ?? state.tick;
  const placeName = leaveSleepingPlace(context, agentId);
  const words = config.sleep.wakeWords[reason ?? "disturbed"];
  const sleptMinutes = (state.tick - startedAtTick) * config.clock.minutesPerTick;
  const awake = findAgent(state, agentId);
  const event = createEvent(state, awake, {
    kind: "woke",
    description: fillWakeWords(words.others, placeName, sleptMinutes),
    actorDescription: fillWakeWords(words.own, placeName, sleptMinutes),
  });
  broadcastEvent(state, event, context.result);
  takeInWaking(state, agentId, sleptMinutes);
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
