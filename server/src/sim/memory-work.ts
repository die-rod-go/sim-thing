import { toSimTime, type AgentMemory } from "@village/shared";
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
  canApplySummary,
  findDueCompression,
  findDueDayEnd,
  findDuePass,
  markPassDone,
  settleMidnight,
  type PassName,
  type SummaryJob,
} from "../memory/summaries";
import {
  applyIdentityReply,
  applyLongTermGoalsReply,
  applyPeopleReply,
  applyShortTermGoalsReply,
} from "../passes/apply-pass";
import {
  buildPassPrompt,
  buildPassReplySchema,
  findPassCallKind,
  type PassReplies,
} from "../passes/pass-prompts";
import { BackgroundWork } from "./background-work";
import { buildHeldKnowledge } from "./held-knowledge";
import { buildGoalMoments, buildPersonalityMoments, recordMoments } from "./moments";
import type { SimDependencies } from "./tick-context";
import {
  findAgent,
  getAgentMemory,
  listLivingAgents,
  listOthersAsSeen,
  markAgentChanged,
  replaceAgent,
} from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("memory");

/** What one finished job does to the world; false when its call failed and it changed nothing. */
type ApplyJob = (state: WorldState, result: TickResult) => boolean;

interface JobOutcome {
  agentId: string;
  /** For the log: "episode", "people pass". */
  jobName: string;
  apply: ApplyJob;
}

export type RunMemoryWork = (state: WorldState, result: TickResult) => Promise<void>;

function setMemory(state: WorldState, agentId: string, memory: AgentMemory): void {
  state.agentMemories[agentId] = memory;
}

/**
 * Writes one pass's reply into the agent as it is now. Each pass writes only the fields it owns,
 * since the reply was asked for some ticks ago.
 */
function applyPassReply<Pass extends PassName>(
  dependencies: SimDependencies,
  state: WorldState,
  result: TickResult,
  agentId: string,
  pass: Pass,
  reply: PassReplies[Pass],
): void {
  const agent = findAgent(state, agentId);
  const replies = { [pass]: reply } as Partial<PassReplies>;
  if (replies.people) {
    replaceAgent(state, applyPeopleReply(agent, replies.people, listOthersAsSeen(state, agentId)));
  }
  if (replies.shortTermGoals) {
    replaceAgent(state, applyShortTermGoalsReply(agent, replies.shortTermGoals));
  }
  if (replies.longTermGoals) {
    const updated = applyLongTermGoalsReply(agent, replies.longTermGoals);
    replaceAgent(state, updated);
    recordMoments(
      state,
      result,
      buildGoalMoments(agent, state.tick, agent.longTermGoals, updated.longTermGoals),
    );
  }
  if (replies.identity) {
    const identity = applyIdentityReply(agent, replies.identity, state.tick);
    replaceAgent(state, identity.agent);
    for (const change of identity.changes) dependencies.recordPersonalityChange?.(change);
    recordMoments(state, result, buildPersonalityMoments(agent, identity.changes));
  }
}

/**
 * Builds the end-of-tick memory step. For every living agent it starts whatever is due, one job
 * per agent at a time, in this order: episode, chronicle, the identity, long-term goals, people
 * and short-term goals passes, then at midnight the day summary and the history, so the passes
 * read the day before it is compressed. Each result is applied in agent order on the first tick
 * after it returns. What is due is read from the saved memory, so a failed call or a restart
 * loses nothing; a failed call leaves everything in place and is tried again after
 * `retryAfterTicks`. Without `shouldCallLlmInBackground` the tick waits until nothing more is due.
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
        return true;
      },
    };
  }

  async function runPass<Pass extends PassName>(
    state: WorldState,
    agentId: string,
    pass: Pass,
  ): Promise<JobOutcome> {
    const agent = findAgent(state, agentId);
    const prompt = buildPassPrompt(
      pass,
      agent,
      buildHeldKnowledge(state, agent),
      dependencies.promptsDirectory,
    );
    const reply = await dependencies.callStructured({
      kind: findPassCallKind(pass),
      agentId,
      tick: state.tick,
      prompt,
      ...buildPassReplySchema(pass),
    });
    return {
      agentId,
      jobName: `${pass} pass`,
      apply: (current, result) => {
        if (!reply.ok) return false;
        applyPassReply(dependencies, current, result, agentId, pass, reply.value);
        setMemory(current, agentId, markPassDone(getAgentMemory(current, agentId), pass));
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

  /** Starts the agent's next due job; false when nothing is due. */
  function startDueJob(state: WorldState, agentId: string, memory: AgentMemory): boolean {
    const compression = findDueCompression(memory);
    if (compression !== null) {
      if (compression.level === "episode") {
        state.streamEntriesInSummary[agentId] = compression.entries.length;
      }
      work.start(state, agentId, () => summarize(state, agentId, compression));
      return true;
    }
    const pass = findDuePass(memory);
    if (pass !== null) {
      work.start(state, agentId, () => runPass(state, agentId, pass));
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
