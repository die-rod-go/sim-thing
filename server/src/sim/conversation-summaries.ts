import type { Dossier, Memory } from "@village/shared";
import { config } from "../config";
import type { StructuredCaller } from "../llm/call-structured";
import { createLogger } from "../logger";
import {
  buildConversationSummaryPrompt,
  buildConversationSummaryReplySchema,
  createConversationSummaryMemory,
  findEndedConversations,
  findSpeakers,
  selectMeanwhileMemories,
  selectOverheardAround,
} from "../memory/conversation-summary";
import { rewriteDossiers } from "../memory/dossiers";
import type { DossierEntry, NamedPerson } from "../memory/dossiers";
import { BackgroundWork } from "./background-work";
import { findAgent, listLivingAgents, markAgentChanged, replaceAgent } from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("conversation-summary");

export interface ConversationSummarizerDependencies {
  callStructured: StructuredCaller;
  promptsDirectory?: string;
  /** Lets the clock run on while summaries are written; each lands on the first tick after it returns. */
  shouldCallLlmInBackground?: boolean;
}

/** Summarises every ended conversation; without background calls the clock waits for it. */
export type SummarizeEndedConversations = (state: WorldState, result: TickResult) => Promise<void>;

interface SummaryOutcome {
  agentId: string;
  conversation: Memory[];
  summary: string | null;
  dossierEntries: DossierEntry[];
}

/** Swaps the conversation's line memories for its summary; lines already forgotten are skipped. */
function replaceLinesWithSummary(
  state: WorldState,
  agentId: string,
  conversation: readonly Memory[],
  summary: string,
): void {
  const summaryMemory = createConversationSummaryMemory(
    agentId,
    conversation,
    summary,
    state.memoryIds,
  );
  for (const line of conversation) state.memoryStore.remove(line.id);
  state.memoryStore.add(summaryMemory);
}

function listOtherAgents(state: WorldState, agentId: string): NamedPerson[] {
  return state.agents
    .filter((other) => other.id !== agentId)
    .map((other) => ({ id: other.id, name: other.name }));
}

function rewriteAgentDossiers(
  state: WorldState,
  result: TickResult,
  outcome: SummaryOutcome,
): void {
  if (outcome.dossierEntries.length === 0) return;
  const agent = findAgent(state, outcome.agentId);
  const dossiers: Record<string, Dossier> = rewriteDossiers(
    agent.dossiers,
    outcome.dossierEntries,
    listOtherAgents(state, agent.id),
    state.tick,
  );
  replaceAgent(state, { ...agent, dossiers });
  markAgentChanged(result, agent.id);
}

/**
 * Builds the end-of-tick conversation summary step. Each agent writes its own summary from the
 * lines it remembers, then those lines are deleted. Calls run in parallel but are applied in agent
 * order, so memory ids don't depend on which call returned first. An agent whose summaries are
 * still being written starts no new ones. After a failed call the agent's lines are kept and
 * retried `retryAfterTicks` later; that wait and summaries in flight are not saved with the world.
 */
export function createConversationSummarizer(
  dependencies: ConversationSummarizerDependencies,
): SummarizeEndedConversations {
  const retryTickByAgent = new Map<string, number>();
  const work = new BackgroundWork<SummaryOutcome[]>("conversation summary");
  const { schema, jsonSchema, schemaName } = buildConversationSummaryReplySchema();

  async function summarize(
    state: WorldState,
    agentId: string,
    conversation: Memory[],
  ): Promise<SummaryOutcome> {
    const result = await dependencies.callStructured({
      kind: "conversation_summary",
      agentId,
      tick: state.tick,
      prompt: buildConversationSummaryPrompt(
        findAgent(state, agentId),
        conversation,
        selectOverheardAround(state.memoryStore, agentId, conversation),
        {
          meanwhile: selectMeanwhileMemories(state.memoryStore, agentId, conversation),
          speakers: findSpeakers(conversation, listOtherAgents(state, agentId)),
        },
        state.tick,
        dependencies.promptsDirectory,
      ),
      schema,
      jsonSchema,
      schemaName,
    });
    return {
      agentId,
      conversation,
      summary: result.ok ? result.value.summary : null,
      dossierEntries: result.ok ? result.value.dossiers : [],
    };
  }

  function isWaitingToRetry(agentId: string, tick: number): boolean {
    const retryTick = retryTickByAgent.get(agentId);
    return retryTick !== undefined && tick < retryTick;
  }

  function applyOutcomes(
    state: WorldState,
    result: TickResult,
    outcomes: readonly SummaryOutcome[],
  ): void {
    for (const outcome of outcomes) {
      if (outcome.summary === null) {
        logger.warn(`conversation summary for ${outcome.agentId} failed at tick ${state.tick}`);
        retryTickByAgent.set(
          outcome.agentId,
          state.tick + config.memory.conversationSummary.retryAfterTicks,
        );
        continue;
      }
      replaceLinesWithSummary(state, outcome.agentId, outcome.conversation, outcome.summary);
      rewriteAgentDossiers(state, result, outcome);
    }
  }

  function startDueSummaries(state: WorldState): void {
    for (const agent of listLivingAgents(state)) {
      if (work.isRunning(state, agent.id) || isWaitingToRetry(agent.id, state.tick)) continue;
      const conversations = findEndedConversations(state.memoryStore, agent.id, state.tick);
      if (conversations.length === 0) continue;
      work.start(state, agent.id, () =>
        Promise.all(conversations.map((conversation) => summarize(state, agent.id, conversation))),
      );
    }
  }

  return async (state, result) => {
    applyOutcomes(state, result, work.collectFinished(state).flat());
    startDueSummaries(state);
    if (dependencies.shouldCallLlmInBackground) return;
    await work.waitForAll(state);
    applyOutcomes(state, result, work.collectFinished(state).flat());
  };
}
