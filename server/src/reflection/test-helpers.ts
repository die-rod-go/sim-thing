import type { Memory } from "@village/shared";
import { createStructuredCaller } from "../llm/call-structured";
import { ConcurrencyLimiter } from "../llm/concurrency-limiter";
import type { FakeReply } from "../llm/fake-llm-client";
import { FakeLlmClient } from "../llm/fake-llm-client";
import { InMemoryTokenUsageStore, TokenBudget } from "../llm/token-budget";

export const TICKS_PER_HOUR = 60;

export function makeFakeCaller(replies: FakeReply[]) {
  const client = new FakeLlmClient(replies);
  const callStructured = createStructuredCaller({
    client,
    limiter: new ConcurrencyLimiter(1),
    budget: new TokenBudget(new InMemoryTokenUsageStore()),
    recordLlmCall: () => null,
    pause: async () => undefined,
  });
  return { client, callStructured };
}

export function lastPrompt(client: FakeLlmClient): string {
  const request = client.requests[client.requests.length - 1];
  return request !== undefined && "prompt" in request ? request.prompt : "";
}

export function makeMemory(overrides: Partial<Memory> & { id: string }): Memory {
  return {
    agentId: "mara",
    bucket: "did",
    tick: 0,
    text: "I did something",
    tags: [],
    strength: 1,
    lastRecalledTick: null,
    ...overrides,
  };
}
