import type { Memory } from "@village/shared";
import { config } from "../config";
import type { StructuredCaller } from "../llm/call-structured";
import { createLogger } from "../logger";
import {
  buildConversationSummaryPrompt,
  buildConversationSummaryReplySchema,
  createConversationSummaryMemory,
  findEndedConversations,
  selectOverheardAround,
} from "../memory/conversation-summary";
import { findAgent, listLivingAgents } from "./world-access";
import type { WorldState } from "./world-state";

const logger = createLogger("conversation-summary");

export interface ConversationSummarizerDependencies {
  callStructured: StructuredCaller;
  promptsDirectory?: string;
}

/** Summarises every ended conversation; the clock waits for it, as it waits for decisions. */
export type SummarizeEndedConversations = (state: WorldState) => Promise<void>;

interface SummaryOutcome {
  agentId: string;
  conversation: Memory[];
  summary: string | null;
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

/**
 * Builds the end-of-tick conversation summary step. Each agent writes its own summary from the
 * lines it remembers, then those lines are deleted. Calls run in parallel but are applied in agent
 * order, so memory ids don't depend on which call returned first. After a failed call the agent's
 * lines are kept and retried `retryAfterTicks` later; that wait is not saved with the world.
 */
export function createConversationSummarizer(
  dependencies: ConversationSummarizerDependencies,
): SummarizeEndedConversations {
  const retryTickByAgent = new Map<string, number>();
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
        state.tick,
        dependencies.promptsDirectory,
      ),
      schema,
      jsonSchema,
      schemaName,
    });
    return { agentId, conversation, summary: result.ok ? result.value.summary : null };
  }

  function isWaitingToRetry(agentId: string, tick: number): boolean {
    const retryTick = retryTickByAgent.get(agentId);
    return retryTick !== undefined && tick < retryTick;
  }

  return async (state) => {
    const pending = listLivingAgents(state)
      .filter((agent) => !isWaitingToRetry(agent.id, state.tick))
      .flatMap((agent) =>
        findEndedConversations(state.memoryStore, agent.id, state.tick).map((conversation) =>
          summarize(state, agent.id, conversation),
        ),
      );
    for (const outcome of await Promise.all(pending)) {
      if (outcome.summary === null) {
        logger.warn(`conversation summary for ${outcome.agentId} failed at tick ${state.tick}`);
        retryTickByAgent.set(
          outcome.agentId,
          state.tick + config.memory.conversationSummary.retryAfterTicks,
        );
        continue;
      }
      replaceLinesWithSummary(state, outcome.agentId, outcome.conversation, outcome.summary);
    }
  };
}
