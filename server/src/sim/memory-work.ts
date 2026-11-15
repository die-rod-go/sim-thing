import { toSimTime } from "@village/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import {
  buildSummaryPrompt,
  buildSummaryReplySchema,
  findSummaryCallKind,
} from "../memory/summary-prompts";
import {
  applySummary,
  beginMidnight,
  findDueSummary,
  settleMidnight,
  type SummaryJob,
} from "../memory/summaries";
import { BackgroundWork } from "./background-work";
import type { SimDependencies } from "./tick-context";
import { findAgent, getAgentMemory, listLivingAgents, markAgentChanged } from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("memory");

interface SummaryOutcome {
  agentId: string;
  job: SummaryJob;
  /** Null when the call failed all its attempts. */
  text: string | null;
}

export type RunMemoryWork = (state: WorldState, result: TickResult) => Promise<void>;

/**
 * Builds the end-of-tick memory step: every living agent's due summary is started, one job per
 * agent at a time, and each result is applied in agent order on the first tick after it returns.
 * What is due is read from the saved memory, so a failed call or a restart loses nothing; a
 * failed call leaves everything in place and is tried again after `retryAfterTicks`. Without
 * `shouldCallLlmInBackground` the tick waits until nothing more is due.
 */
export function createMemoryWork(dependencies: SimDependencies): RunMemoryWork {
  const work = new BackgroundWork<SummaryOutcome>("memory summary");

  async function summarize(
    state: WorldState,
    agentId: string,
    job: SummaryJob,
  ): Promise<SummaryOutcome> {
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
    return { agentId, job, text: reply.ok ? reply.value.summary : null };
  }

  function applyOutcomes(
    state: WorldState,
    result: TickResult,
    outcomes: readonly SummaryOutcome[],
  ): void {
    for (const { agentId, job, text } of outcomes) {
      delete state.streamEntriesInSummary[agentId];
      const memory = getAgentMemory(state, agentId);
      if (text === null) {
        logger.warn(`${job.level} summary for ${agentId} failed at tick ${state.tick}`);
        const retryAtTick = state.tick + config.memory.retryAfterTicks;
        state.agentMemories[agentId] = { ...memory, retryAtTick };
        continue;
      }
      state.agentMemories[agentId] = settleMidnight(applySummary(memory, job, text));
      markAgentChanged(result, agentId);
    }
  }

  function startDueSummaries(state: WorldState): void {
    const { day } = toSimTime(state.tick, config.clock);
    for (const agent of listLivingAgents(state)) {
      if (work.isRunning(state, agent.id)) continue;
      const memory = settleMidnight(beginMidnight(getAgentMemory(state, agent.id), day));
      state.agentMemories[agent.id] = memory;
      if (memory.retryAtTick !== null && state.tick < memory.retryAtTick) continue;
      const job = findDueSummary(memory);
      if (job === null) continue;
      state.agentMemories[agent.id] = { ...memory, retryAtTick: null };
      if (job.level === "episode") state.streamEntriesInSummary[agent.id] = job.entries.length;
      work.start(state, agent.id, () => summarize(state, agent.id, job));
    }
  }

  return async (state, result) => {
    applyOutcomes(state, result, work.collectFinished(state));
    startDueSummaries(state);
    if (dependencies.shouldCallLlmInBackground) return;
    while (work.hasAnyInFlight(state)) {
      await work.waitForAll(state);
      applyOutcomes(state, result, work.collectFinished(state));
      startDueSummaries(state);
    }
  };
}
