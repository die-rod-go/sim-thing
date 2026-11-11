import { formatSimTime } from "@village/shared";
import type { Agent, Memory } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { ReplySchemas } from "../decision/reply-schema";
import { dropEmptyFields, strictJsonObject } from "../decision/schema-fields";
import { describeTraits } from "../decision/words";
import { renderTemplate } from "../llm/templates";
import { truncateMemoryText } from "./filing";
import type { MemoryIdGenerator, MemoryReader } from "./memory-store";
import { normalizeTag, uniqueTags } from "./tags";

/** Marks a `conversations` memory as a summary, so it is never summarised again. */
export const CONVERSATION_SUMMARY_TAG = "conversation summary";
export const CONVERSATION_SUMMARY_SCHEMA_NAME = "conversation_summary_reply";

const CONVERSATION_SUMMARY_TEMPLATE = "conversation-summary";

export interface ConversationSummaryReply {
  summary: string;
}

export function buildConversationSummaryReplySchema(): ReplySchemas<ConversationSummaryReply> {
  return {
    schema: z.preprocess(dropEmptyFields, z.object({ summary: z.string().trim().min(1) })),
    jsonSchema: strictJsonObject({ summary: { type: "string" } }),
    schemaName: CONVERSATION_SUMMARY_SCHEMA_NAME,
  };
}

export function isConversationSummary(memory: Memory): boolean {
  return memory.tags.includes(normalizeTag(CONVERSATION_SUMMARY_TAG));
}

function compareOldestFirst(first: Memory, second: Memory): number {
  return first.tick - second.tick || first.id.localeCompare(second.id);
}

/** The agent's remembered lines of speech (said or heard while taking part), oldest first. */
export function selectLineMemories(memories: MemoryReader, agentId: string): Memory[] {
  return memories
    .listByAgentAndBucket(agentId, "conversations")
    .filter((memory) => !isConversationSummary(memory))
    .sort(compareOldestFirst);
}

/**
 * Splits lines into conversations: a quiet gap of `endAfterQuietTicks` starts a new one, and so
 * does reaching `maxLinesPerSummary`, so a long conversation is summarised in parts.
 */
export function groupIntoConversations(lines: readonly Memory[]): Memory[][] {
  const { endAfterQuietTicks, maxLinesPerSummary } = config.memory.conversationSummary;
  const conversations: Memory[][] = [];
  let current: Memory[] = [];
  for (const line of lines) {
    const previous = current[current.length - 1];
    const isAfterQuietGap =
      previous !== undefined && line.tick - previous.tick >= endAfterQuietTicks;
    if (isAfterQuietGap || current.length >= maxLinesPerSummary) {
      conversations.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) conversations.push(current);
  return conversations;
}

function isEnded(conversation: readonly Memory[], tick: number): boolean {
  const { endAfterQuietTicks, maxLinesPerSummary } = config.memory.conversationSummary;
  const lastLine = conversation[conversation.length - 1];
  if (lastLine === undefined) return false;
  return tick - lastLine.tick >= endAfterQuietTicks || conversation.length >= maxLinesPerSummary;
}

/** The agent's conversations that are over (or full) and ready to be summarised, oldest first. */
export function findEndedConversations(
  memories: MemoryReader,
  agentId: string,
  tick: number,
): Memory[][] {
  return groupIntoConversations(selectLineMemories(memories, agentId)).filter((conversation) =>
    isEnded(conversation, tick),
  );
}

/**
 * What the agent overheard during the conversation and just before it. A line addressed to an
 * agent before it has spoken is filed as overheard, so this is often how the conversation began.
 * These are shown for context only; they stay in `overheard` and fade there.
 */
export function selectOverheardAround(
  memories: MemoryReader,
  agentId: string,
  conversation: readonly Memory[],
): Memory[] {
  const firstTick = conversation[0]?.tick;
  const lastTick = conversation[conversation.length - 1]?.tick;
  if (firstTick === undefined || lastTick === undefined) return [];
  const leadInStartTick = firstTick - config.memory.conversationSummary.endAfterQuietTicks;
  return memories
    .listByAgentAndBucket(agentId, "overheard")
    .filter((memory) => memory.tick >= leadInStartTick && memory.tick <= lastTick);
}

function describeTranscript(lines: readonly Memory[]): string {
  return [...lines]
    .sort(compareOldestFirst)
    .map((line) => `- ${formatSimTime(line.tick, config.clock)}: ${line.text}`)
    .join("\n");
}

export function buildConversationSummaryPrompt(
  agent: Agent,
  conversation: readonly Memory[],
  overheard: readonly Memory[],
  tick: number,
  promptsDirectory?: string,
): string {
  return renderTemplate(
    CONVERSATION_SUMMARY_TEMPLATE,
    {
      name: agent.name,
      profession: agent.profession,
      traits: describeTraits(agent.personality.traits),
      core: agent.personality.core,
      transcript: describeTranscript([...conversation, ...overheard]),
      simTime: formatSimTime(tick, config.clock),
      maxChars: String(config.memory.conversationSummary.maxChars),
    },
    promptsDirectory,
  );
}

/**
 * The summary memory that replaces a conversation's lines. It keeps the tick of the last line, so
 * it ages like the conversation it stands for, and every tag the lines had.
 */
export function createConversationSummaryMemory(
  agentId: string,
  conversation: readonly Memory[],
  summary: string,
  idGenerator: MemoryIdGenerator,
): Memory {
  const lastTick = conversation[conversation.length - 1]?.tick ?? 0;
  return {
    id: idGenerator.nextId(agentId, lastTick),
    agentId,
    bucket: "conversations",
    tick: lastTick,
    text: truncateMemoryText(summary, config.memory.conversationSummary.maxChars),
    tags: uniqueTags([CONVERSATION_SUMMARY_TAG, ...conversation.flatMap((line) => line.tags)]),
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}
