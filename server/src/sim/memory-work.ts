import { toSimTime, type AgentMemory } from "@village/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import { isReflectionDue } from "../memory/reflection-progress";
import {
  buildSummaryPrompt,
  buildSummaryReplySchema,
  findSummaryCallKind,
} from "../memory/summary-prompts";
import {
  applySummary,
  beginMidnight,
  canApplySummary,
  findDueCompression,
  findDueDayEnd,
  isDayPlanDue,
  settleMidnight,
  type SummaryJob,
} from "../memory/summaries";
import { BackgroundWork } from "./background-work";
import { planDay } from "./day-plan-job";
import { addKeyMemoryCandidate } from "./key-memories";
import type { JobOutcome } from "./memory-job";
import { checkReality } from "./reality-job";
import { reflect } from "./reflection-job";
import type { SimDependencies } from "./tick-context";
import { findAgent, getAgentMemory, listLivingAgents, markAgentChanged } from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("memory");

export type RunMemoryWork = (state: WorldState, result: TickResult) => Promise<void>;

function setMemory(state: WorldState, agentId: string, memory: AgentMemory): void {
  state.agentMemories[agentId] = memory;
}

/**
 * Builds the end-of-tick memory step. For every living agent it starts whatever is due, one job
 * per agent at a time, in this order: the day plan, an episode or chronicle, the reality pass,
 * the reflection, then at midnight the day summary and the history, so a reflection reads the
 * day before it is compressed. Each result is applied in agent order on the first tick after it
 * returns. What is due is read from the saved memory, so a failed call or a restart loses nothing;
 * a failed call leaves everything in place and is tried again after `retryAfterTicks`. Without
 * `shouldCallLlmInBackground` the tick waits until nothing more is due.
 */
export function createMemoryWork(dependencies: SimDependencies): RunMemoryWork {
  const work = new BackgroundWork<JobOutcome>("memory work");

  async function summarize(
    state: WorldState,
    agentId: string,
    job: SummaryJob,
  ): Promise<JobOutcome> {
    const reply = await dependencies.callStructured({
      kind: findSummaryCallKind(job.level),
      agentId,
      tick: state.tick,
      prompt: buildSummaryPrompt(
        findAgent(state, agentId).name,
        job,
        dependencies.promptsDirectory,
      ),
      ...buildSummaryReplySchema(job.level),
    });
    return {
      agentId,
      jobName: job.level,
      apply: (current) => {
        if (!reply.ok) return false;
        const memory = getAgentMemory(current, agentId);
        if (!canApplySummary(memory, job)) return false;
        setMemory(current, agentId, settleMidnight(applySummary(memory, job, reply.value.summary)));
        const keyMemory = reply.value.keyMemory?.trim() ?? "";
        if (keyMemory !== "") addKeyMemoryCandidate(current, agentId, keyMemory);
        return true;
      },
    };
  }

  function applyOutcomes(
    state: WorldState,
    result: TickResult,
    outcomes: readonly JobOutcome[],
  ): void {
    for (const { agentId, jobName, apply } of outcomes) {
      delete state.streamEntriesInSummary[agentId];
      if (apply(state, result)) {
        markAgentChanged(result, agentId);
        continue;
      }
      logger.warn(`${jobName} for ${agentId} failed at tick ${state.tick}`);
      const retryAtTick = state.tick + config.memory.retryAfterTicks;
      setMemory(state, agentId, { ...getAgentMemory(state, agentId), retryAtTick });
    }
  }

  /**
   * Starts the agent's next due job; false when nothing is due. A played agent's mind is its
   * player's: its memory is still summarized, but no day plan, reality pass or reflection runs
   * for it until the LLM takes it back.
   */
  function startDueJob(state: WorldState, agentId: string, memory: AgentMemory): boolean {
    const isPlayed = findAgent(state, agentId).isPlayed;
    if (!isPlayed && isDayPlanDue(memory)) {
      work.start(state, agentId, () => planDay(dependencies, state, agentId));
      return true;
    }
    const compression = findDueCompression(memory);
    if (compression !== null) {
      if (compression.level === "episode") {
        state.streamEntriesInSummary[agentId] = compression.entries.length;
      }
      work.start(state, agentId, () => summarize(state, agentId, compression));
      return true;
    }
    if (!isPlayed && memory.isRealityPassOwed) {
      work.start(state, agentId, () => checkReality(dependencies, state, agentId));
      return true;
    }
    if (!isPlayed && isReflectionDue(memory, state.tick)) {
      work.start(state, agentId, () => reflect(dependencies, state, agentId));
      return true;
    }
    const dayEnd = findDueDayEnd(memory);
    if (dayEnd === null) return false;
    work.start(state, agentId, () => summarize(state, agentId, dayEnd));
    return true;
  }

  function startDueJobs(state: WorldState): void {
    const { day } = toSimTime(state.tick, config.clock);
    for (const agent of listLivingAgents(state)) {
      if (work.isRunning(state, agent.id)) continue;
      const memory = settleMidnight(beginMidnight(getAgentMemory(state, agent.id), day));
      setMemory(state, agent.id, memory);
      if (memory.retryAtTick !== null && state.tick < memory.retryAtTick) continue;
      if (memory.retryAtTick !== null) setMemory(state, agent.id, { ...memory, retryAtTick: null });
      startDueJob(state, agent.id, memory);
    }
  }

  return async (state, result) => {
    applyOutcomes(state, result, work.collectFinished(state));
    startDueJobs(state);
    if (dependencies.shouldCallLlmInBackground) return;
    while (work.hasAnyInFlight(state)) {
      await work.waitForAll(state);
      applyOutcomes(state, result, work.collectFinished(state));
      startDueJobs(state);
    }
  };
}
