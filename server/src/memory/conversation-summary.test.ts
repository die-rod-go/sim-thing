import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  CONVERSATION_SUMMARY_TAG,
  createConversationSummaryMemory,
  findEndedConversations,
  groupIntoConversations,
  selectLineMemories,
  selectOverheardAround,
} from "./conversation-summary";
import { MemoryIdGenerator, MemoryStore } from "./memory-store";

const { endAfterQuietTicks, maxLinesPerSummary, maxChars } = config.memory.conversationSummary;

function line(id: string, tick: number, overrides: Partial<Memory> = {}): Memory {
  return {
    id,
    agentId: "mara",
    bucket: "conversations",
    tick,
    text: `I said: "line ${id}"`,
    tags: ["mara"],
    strength: 1,
    lastRecalledTick: null,
    ...overrides,
  };
}

function storeWith(memories: Memory[]): MemoryStore {
  const store = new MemoryStore();
  store.addAll(memories);
  return store;
}

function idsOf(conversations: Memory[][]): string[][] {
  return conversations.map((conversation) => conversation.map((memory) => memory.id));
}

describe("conversation summaries", () => {
  it("starts a new conversation after a quiet gap", () => {
    const lines = [line("a", 0), line("b", 3), line("c", 3 + endAfterQuietTicks)];
    expect(idsOf(groupIntoConversations(lines))).toEqual([["a", "b"], ["c"]]);
  });

  it("splits a long conversation into parts of at most the line limit", () => {
    const lines = Array.from({ length: maxLinesPerSummary + 1 }, (_unused, index) =>
      line(`line${index}`, index),
    );
    const sizes = groupIntoConversations(lines).map((conversation) => conversation.length);
    expect(sizes).toEqual([maxLinesPerSummary, 1]);
  });

  it("leaves a conversation unsummarised until it has been quiet long enough", () => {
    const store = storeWith([line("a", 0), line("b", 5)]);
    expect(findEndedConversations(store, "mara", 5 + endAfterQuietTicks - 1)).toEqual([]);
    expect(idsOf(findEndedConversations(store, "mara", 5 + endAfterQuietTicks))).toEqual([
      ["a", "b"],
    ]);
  });

  it("summarises a full conversation even while it is still going", () => {
    const lines = Array.from({ length: maxLinesPerSummary }, (_unused, index) =>
      line(`line${index}`, index),
    );
    const ended = findEndedConversations(storeWith(lines), "mara", maxLinesPerSummary);
    expect(ended.map((conversation) => conversation.length)).toEqual([maxLinesPerSummary]);
  });

  it("only treats the agent's own remembered lines as conversation, never earlier summaries", () => {
    const store = storeWith([
      line("summary", 0, { tags: [CONVERSATION_SUMMARY_TAG] }),
      line("line", 1),
      line("other agent", 1, { agentId: "bram" }),
      line("overheard", 1, { bucket: "overheard" }),
    ]);
    expect(selectLineMemories(store, "mara").map((memory) => memory.id)).toEqual(["line"]);
  });

  it("adds what was overheard just before and during the conversation, nothing earlier or later", () => {
    const conversation = [line("first", 20), line("last", 30)];
    const overheard = (id: string, tick: number) => line(id, tick, { bucket: "overheard" });
    const store = storeWith([
      ...conversation,
      overheard("too early", 20 - endAfterQuietTicks - 1),
      overheard("lead-in", 20 - endAfterQuietTicks),
      overheard("during", 25),
      overheard("after", 31),
    ]);
    const shown = selectOverheardAround(store, "mara", conversation).map((memory) => memory.id);
    expect(shown).toEqual(["lead-in", "during"]);
  });

  it("files a summary at the last line's tick with every tag the lines had", () => {
    const conversation = [
      line("a", 2, { tags: ["mara", "bakery"] }),
      line("b", 7, { tags: ["bram", "bakery"] }),
    ];
    const summary = createConversationSummaryMemory(
      "mara",
      conversation,
      "Bram asked for bread; I said tomorrow.",
      new MemoryIdGenerator(),
    );
    expect(summary).toMatchObject({
      agentId: "mara",
      bucket: "conversations",
      tick: 7,
      text: "Bram asked for bread; I said tomorrow.",
    });
    expect(summary.tags).toEqual([CONVERSATION_SUMMARY_TAG, "mara", "bakery", "bram"]);
  });

  it("cuts a summary longer than the summary limit", () => {
    const summary = createConversationSummaryMemory(
      "mara",
      [line("a", 0)],
      "word ".repeat(maxChars),
      new MemoryIdGenerator(),
    );
    expect(summary.text.length).toBeLessThanOrEqual(maxChars);
  });
});
