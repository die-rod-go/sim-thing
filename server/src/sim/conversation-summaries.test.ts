import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { FakeResponder } from "../llm/fake-llm-client";
import { CONVERSATION_SUMMARY_SCHEMA_NAME } from "../memory/conversation-summary";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
} from "./test-sim";

const SQUARE = { x: 19, y: 15 };
const { endAfterQuietTicks, retryAfterTicks } = config.memory.conversationSummary;
const TICKS_UNTIL_SUMMARY = 1 + endAfterQuietTicks + 1;

const greetings = scriptByAgent({
  Ilsa: (request) =>
    promptOf(request).includes("No one has been talking with you.")
      ? decisionReply({ say: "Morning, Mara", action: "wait", minutes: 240 })
      : undefined,
  Mara: (request) =>
    promptOf(request).includes('"Morning, Mara"')
      ? decisionReply({ say: "Morning, Ilsa", action: "wait", minutes: 240 })
      : undefined,
});

/** Summary calls answer with "<name> remembers the greeting"; everything else follows `greetings`. */
function summarizingBy(summaryAnswer: (agentName: string) => string | null): FakeResponder {
  return (request, callIndex) => {
    if (request.schemaName !== CONVERSATION_SUMMARY_SCHEMA_NAME) {
      return greetings(request, callIndex);
    }
    const summary = summaryAnswer(findPromptAgentName(request));
    return summary === null ? "not json" : JSON.stringify({ summary });
  };
}

function startGreetingSim(responder: FakeResponder) {
  const sim = createTestSim({ agentIds: ["mara", "bram", "ilsa"], responder });
  sim.placeAgent("ilsa", SQUARE);
  sim.placeAgent("mara", { x: SQUARE.x + 1, y: SQUARE.y });
  sim.placeAgent("bram", { x: SQUARE.x + 3, y: SQUARE.y });
  return sim;
}

function conversationTexts(sim: ReturnType<typeof createTestSim>, agentId: string): string[] {
  return sim.state.memoryStore
    .listByAgentAndBucket(agentId, "conversations")
    .map((memory) => memory.text);
}

function summaryPrompts(sim: ReturnType<typeof createTestSim>): string[] {
  return sim.records
    .filter((record) => record.kind === "conversation_summary")
    .map((record) => record.prompt);
}

describe("conversation summaries in the sim", () => {
  it("keeps the lines while the conversation is still going", async () => {
    const sim = startGreetingSim(summarizingBy((name) => `${name} remembers the greeting`));
    await sim.advance(TICKS_UNTIL_SUMMARY - 1);
    expect(conversationTexts(sim, "mara")).toEqual(['I said: "Morning, Ilsa"']);
    expect(conversationTexts(sim, "ilsa")).toEqual([
      'I said: "Morning, Mara"',
      'Mara said: "Morning, Ilsa"',
    ]);
    expect(summaryPrompts(sim)).toEqual([]);
  });

  it("replaces each participant's lines with their own summary once the conversation goes quiet", async () => {
    const sim = startGreetingSim(summarizingBy((name) => `${name} remembers the greeting`));
    await sim.advance(TICKS_UNTIL_SUMMARY);
    expect(conversationTexts(sim, "mara")).toEqual(["Mara remembers the greeting"]);
    expect(conversationTexts(sim, "ilsa")).toEqual(["Ilsa remembers the greeting"]);
  });

  it("shows the opening line a participant overheard before joining, and keeps it", async () => {
    const sim = startGreetingSim(summarizingBy((name) => `${name} remembers the greeting`));
    await sim.advance(TICKS_UNTIL_SUMMARY);
    const prompts = summaryPrompts(sim);
    expect(prompts).toHaveLength(2);
    const maraPrompt = prompts.find((prompt) => prompt.startsWith("You are Mara,")) ?? "";
    expect(maraPrompt).toContain('I overheard Ilsa say: "Morning, Mara"');
    expect(maraPrompt).toContain('I said: "Morning, Ilsa"');
    const maraOverheard = sim.state.memoryStore.listByAgentAndBucket("mara", "overheard");
    expect(maraOverheard.map((memory) => memory.text)).toContain(
      'I overheard Ilsa say: "Morning, Mara"',
    );
  });

  it("gives a bystander who only overheard no summary", async () => {
    const sim = startGreetingSim(summarizingBy((name) => `${name} remembers the greeting`));
    await sim.advance(TICKS_UNTIL_SUMMARY);
    expect(summaryPrompts(sim).some((prompt) => prompt.startsWith("You are Bram,"))).toBe(false);
    expect(sim.state.memoryStore.listByAgentAndBucket("bram", "overheard")).not.toEqual([]);
  });

  it("keeps the lines when the summary call fails and tries again later", async () => {
    let isSummaryFailing = true;
    const sim = startGreetingSim(
      summarizingBy((name) => (isSummaryFailing ? null : `${name} remembers the greeting`)),
    );
    await sim.advance(TICKS_UNTIL_SUMMARY);
    expect(conversationTexts(sim, "mara")).toEqual(['I said: "Morning, Ilsa"']);
    const failedCallCount = summaryPrompts(sim).length;
    isSummaryFailing = false;
    await sim.advance(retryAfterTicks - 1);
    expect(summaryPrompts(sim)).toHaveLength(failedCallCount);
    await sim.advance(1);
    expect(conversationTexts(sim, "mara")).toEqual(["Mara remembers the greeting"]);
  });
});
