import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  buildConversationSummaryPrompt,
  buildConversationSummaryReplySchema,
  CONVERSATION_SUMMARY_TAG,
  createConversationSummaryMemory,
  findEndedConversations,
  findSpeakers,
  groupIntoConversations,
  selectLineMemories,
  selectMeanwhileMemories,
  selectOverheardAround,
} from "./conversation-summary";
import { makeAgent } from "../economy/test-fixtures";
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

  it("accepts a summary a little over the asked length and rejects one far over it", () => {
    const { schema } = buildConversationSummaryReplySchema();
    const slightlyOver = "x".repeat(maxChars + Math.floor(maxChars / 10));
    const farOver = "x".repeat(Math.ceil(maxChars * config.llm.replyTextSlack) + 1);
    expect(schema.safeParse({ summary: slightlyOver }).success).toBe(true);
    expect(schema.safeParse({ summary: farOver }).success).toBe(false);
    expect(schema.safeParse({ summary: "I talked with Edwin." }).success).toBe(true);
  });

  it("shows the agent's own deeds and sightings from the conversation's span, newest few", () => {
    const conversation = [line("first", 20), line("last", 30)];
    const memory = (id: string, tick: number, bucket: Memory["bucket"]) =>
      line(id, tick, { bucket, text: `I did ${id}` });
    const store = storeWith([
      ...conversation,
      memory("before", 19, "did"),
      memory("start", 20, "did"),
      memory("seen", 25, "seen"),
      memory("end", 30, "did"),
      memory("after", 31, "did"),
      memory("tail", 25, "did"),
      { ...memory("other agent", 25, "did"), agentId: "bram" },
      memory("not a deed", 25, "places"),
    ]);
    const shown = selectMeanwhileMemories(store, "mara", conversation).map((entry) => entry.id);
    expect(shown).toEqual(["start", "seen", "tail", "end"]);
    const { meanwhileMemoriesShown } = config.memory.conversationSummary;
    const many = Array.from({ length: meanwhileMemoriesShown + 3 }, (_unused, index) =>
      memory(`deed${index}`, 21 + (index % 9), "did"),
    );
    const capped = selectMeanwhileMemories(
      storeWith([...conversation, ...many]),
      "mara",
      conversation,
    );
    expect(capped).toHaveLength(meanwhileMemoriesShown);
  });

  it("names the other agents who spoke in the lines", () => {
    const conversation = [
      line("a", 1, { text: 'I said: "Hello"' }),
      line("b", 2, { text: 'Bram said: "Hello"' }),
      line("c", 3, { text: 'Bramwell said: "Hi"' }),
    ];
    const others = [
      { id: "bram", name: "Bram" },
      { id: "ilsa", name: "Ilsa" },
    ];
    expect(findSpeakers(conversation, others)).toEqual([{ id: "bram", name: "Bram" }]);
  });

  it("shows what happened meanwhile and what the agent knows about the speakers", () => {
    const agent = makeAgent({ dossiers: { bram: { text: "Owes me an axe.", updatedTick: 0 } } });
    const prompt = buildConversationSummaryPrompt(
      agent,
      [line("a", 1)],
      [],
      {
        meanwhile: [
          line("m", 1, { bucket: "did", text: "I tried to hand Bram an axe but had none" }),
        ],
        speakers: [
          { id: "bram", name: "Bram" },
          { id: "ilsa", name: "Ilsa" },
        ],
      },
      5,
    );
    expect(prompt).toContain("## What happened meanwhile");
    expect(prompt).toContain("I tried to hand Bram an axe but had none");
    expect(prompt).toContain("- Bram: Owes me an axe.");
    expect(prompt).toContain(`- Ilsa: ${config.dossier.unknownPersonText}`);
  });

  it("accepts rewritten dossiers and rejects one far over the dossier limit", () => {
    const { schema } = buildConversationSummaryReplySchema();
    const summary = "I talked with Bram.";
    expect(schema.parse({ summary }).dossiers).toEqual([]);
    const entry = { person: "Bram", text: "Keeps his word." };
    expect(schema.parse({ summary, dossiers: [entry] }).dossiers).toEqual([entry]);
    const farOverChars = Math.ceil(config.dossier.maxChars * config.llm.replyTextSlack) + 1;
    const tooLong = { person: "Bram", text: "x".repeat(farOverChars) };
    expect(schema.safeParse({ summary, dossiers: [tooLong] }).success).toBe(false);
  });
});
