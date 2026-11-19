import { config } from "../config";
import { describeMissedReminder, describeReminderReason, findDueReminders } from "../agenda/agenda";
import { isAsleep } from "../economy/sleep";
import { MINUTES_PER_HOUR } from "../economy/types";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import type { TickContext } from "./tick-context";
import { appendToStream, findAgent, getAgentMemory, listLivingAgents } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * When an agenda item's hour comes, an awake agent gets an urgent decision with the item as its
 * reason; a sleeper isn't woken, and finds it missed when it wakes. Each item reminds only once.
 * A played agent's agenda is the LLM's, from before the player took over, so it reminds no one.
 */
export function flagReminders(context: TickContext): void {
  const { state } = context;
  for (const agent of listLivingAgents(state)) {
    if (agent.isPlayed) continue;
    const runtime = getAgentRuntime(state, agent.id);
    const numbers = new Set(agent.agenda.map((item) => item.number));
    runtime.firedReminderNumbers = runtime.firedReminderNumbers.filter((number) =>
      numbers.has(number),
    );
    for (const item of findDueReminders(agent.agenda, state.tick, runtime.firedReminderNumbers)) {
      runtime.firedReminderNumbers.push(item.number);
      if (isAsleep(agent)) runtime.missedReminderNumbers.push(item.number);
      else requestDecision(runtime, describeReminderReason(item), true);
    }
  }
}

/**
 * On waking: every item whose hour passed in sleep is filed as missed, and a sleep long enough
 * owes a day plan, so the agent plans the day before it decides anything.
 */
export function takeInWaking(state: WorldState, agentId: string, sleptMinutes: number): void {
  const runtime = getAgentRuntime(state, agentId);
  const agent = findAgent(state, agentId);
  for (const item of agent.agenda) {
    if (runtime.missedReminderNumbers.includes(item.number)) {
      appendToStream(state, agentId, describeMissedReminder(item));
    }
  }
  runtime.missedReminderNumbers = [];
  if (sleptMinutes < config.agenda.dayPlanMinSleepHours * MINUTES_PER_HOUR) return;
  state.agentMemories[agentId] = {
    ...getAgentMemory(state, agentId),
    dayPlanOwedSinceTick: state.tick,
  };
}

/** Whether the agent is lying awake waiting for its day plan, which holds its decisions. */
export function isWaitingForDayPlan(state: WorldState, agentId: string): boolean {
  const owedSince = getAgentMemory(state, agentId).dayPlanOwedSinceTick;
  return owedSince !== null && state.tick - owedSince < config.agenda.dayPlanMaxWaitTicks;
}
