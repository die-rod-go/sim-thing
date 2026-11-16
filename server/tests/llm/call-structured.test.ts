import { describe, expect, it } from "vitest";
import { z } from "zod";
import { config } from "../../src/config";
import type { LlmCallDraft } from "../../src/llm/call-structured";
import { BUDGET_REACHED_ERROR, createStructuredCaller } from "../../src/llm/call-structured";
import { ConcurrencyLimiter } from "../../src/llm/concurrency-limiter";
import type { FakeReply } from "../../src/llm/fake-llm-client";
import { FakeLlmClient } from "../../src/llm/fake-llm-client";
import { InMemoryTokenUsageStore, TokenBudget } from "../../src/llm/token-budget";

const replySchema = z.object({ answer: z.string() });
const NOON = new Date(2026, 10, 10, 12, 0, 0);

function setUp(
  replies: FakeReply[],
  dailyTokenBudget = 1_000_000,
  reflectionModel?: string,
  realityModel?: string,
) {
  const client = new FakeLlmClient(replies);
  const records: LlmCallDraft[] = [];
  const pauses: number[] = [];
  const store = new InMemoryTokenUsageStore();
  const budget = new TokenBudget(store, { dailyTokenBudget, now: () => NOON });
  const callStructured = createStructuredCaller({
    client,
    limiter: new ConcurrencyLimiter(2),
    budget,
    recordLlmCall: (record) => records.push(record),
    reflectionModel,
    realityModel,
    pause: async (milliseconds) => {
      pauses.push(milliseconds);
    },
  });
  const request = {
    kind: "decision" as const,
    agentId: "mara",
    tick: 42,
    prompt: "What now?",
    schema: replySchema,
  };
  return { client, records, pauses, budget, callStructured, request };
}

describe("callStructured with a reflection model", () => {
  it("sends reflection calls to the reflection model and decisions to the client's own", async () => {
    const { client, records, callStructured, request } = setUp(
      ['{"answer":"a"}', '{"answer":"b"}'],
      1_000_000,
      "stronger-model",
    );
    config.llm.reflectionKinds.push("interact");
    try {
      await callStructured({ ...request, kind: "interact" });
      await callStructured(request);
    } finally {
      config.llm.reflectionKinds.pop();
    }
    expect(client.requests.map((sent) => sent.model)).toEqual(["stronger-model", undefined]);
    expect(records.map((record) => record.model)).toEqual(["stronger-model", "fake-model"]);
  });

  it("sends the reality pass to its own model, and other reflection calls to theirs", async () => {
    const { client, callStructured, request } = setUp(
      ['{"answer":"a"}', '{"answer":"b"}'],
      1_000_000,
      "stronger-model",
      "reality-model",
    );
    await callStructured({ ...request, kind: "reality" });
    await callStructured({ ...request, kind: "people" });
    expect(client.requests.map((sent) => sent.model)).toEqual(["reality-model", "stronger-model"]);
  });

  it("keeps thinking for the kinds that think, with room for it on top of the reply", async () => {
    const { client, callStructured, request } = setUp(['{"answer":"a"}', '{"answer":"b"}']);
    await callStructured({ ...request, kind: "reality" });
    await callStructured(request);
    expect(client.requests.map((sent) => sent.shouldThink)).toEqual([true, false]);
    expect(client.requests.map((sent) => sent.effort)).toEqual([
      config.llm.effortByKind.reality,
      config.llm.effortByKind.decision,
    ]);
    expect(client.requests.map((sent) => sent.maxTokens)).toEqual([
      config.llm.maxReplyTokens.reality + config.llm.thinkingTokenAllowance,
      config.llm.maxReplyTokens.decision,
    ]);
  });

  it("sends the reality pass to the reflection model when it has none of its own", async () => {
    const { client, callStructured, request } = setUp(
      ['{"answer":"a"}'],
      1_000_000,
      "stronger-model",
    );
    await callStructured({ ...request, kind: "reality" });
    expect(client.requests.map((sent) => sent.model)).toEqual(["stronger-model"]);
  });
});

describe("callStructured", () => {
  it("returns the validated value from a fake client reply", async () => {
    const { callStructured, request } = setUp(['{"answer":"bread"}']);
    const result = await callStructured(request);
    expect(result.ok && result.value).toEqual({ answer: "bread" });
  });

  it("retries once on invalid JSON then reports failure", async () => {
    const { client, callStructured, request, pauses } = setUp(["not json", "{still not json"]);
    const result = await callStructured(request);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/invalid JSON/);
    expect(client.callCount).toBe(2);
    expect(pauses).toHaveLength(1);
  });

  it("explains a reply cut off at the token limit", async () => {
    const cutOffReply = { text: '{"answer":"bre', wasCutOff: true };
    const { callStructured, request, records } = setUp([cutOffReply, cutOffReply]);
    const result = await callStructured({ ...request, maxTokens: 400 });
    expect(!result.ok && result.error).toBe(
      "reply cut off at the 400-token limit (config.llm.maxReplyTokens.decision)",
    );
    expect(records[0]?.error).toMatch(/cut off/);
  });

  it("retries once on API error", async () => {
    const { client, callStructured, request } = setUp([new Error("HTTP 503"), '{"answer":"ale"}']);
    const result = await callStructured(request);
    expect(result.ok && result.value).toEqual({ answer: "ale" });
    expect(client.callCount).toBe(2);
  });

  it("retries once when the reply fails schema validation", async () => {
    const { callStructured, request } = setUp(['{"answer":3}', '{"answer":"wood"}']);
    const result = await callStructured(request);
    expect(result.ok && result.value).toEqual({ answer: "wood" });
  });

  it("tells the model why its reply was rejected when it retries", async () => {
    const { callStructured, request, records } = setUp(['{"answer":3}', '{"answer":"wood"}']);
    await callStructured(request);
    expect(records[0]?.prompt).toBe("What now?");
    expect(records[1]?.prompt).toMatch(/^What now\?\n\n## Your last reply was rejected\n.*answer/s);
  });

  it("reports which fields of a rejected reply were wrong even when the retry succeeds", async () => {
    const { callStructured, request } = setUp(['{"answer":3}', '{"answer":"wood"}']);
    const result = await callStructured(request);
    expect(result).toMatchObject({
      ok: true,
      rejectedReplies: [{ value: { answer: 3 }, fields: ["answer"] }],
    });
  });

  it("retries an API error with the prompt unchanged", async () => {
    const { callStructured, request, records } = setUp([new Error("HTTP 503"), '{"answer":"x"}']);
    await callStructured(request);
    expect(records[1]?.prompt).toBe("What now?");
  });

  it("records every attempt in the call log", async () => {
    const { callStructured, request, records } = setUp([new Error("timeout"), '{"answer":"x"}']);
    await callStructured(request);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      agentId: "mara",
      tick: 42,
      kind: "decision",
      prompt: "What now?",
      reply: "",
      error: "API error: timeout",
    });
    expect(records[1]).toMatchObject({
      reply: '{"answer":"x"}',
      parsed: { answer: "x" },
      error: null,
      promptTokens: 100,
      completionTokens: 20,
      model: "fake-model",
    });
  });

  it("counts every attempt's tokens against the daily budget", async () => {
    const { callStructured, request, budget } = setUp(["bad", '{"answer":"x"}']);
    await callStructured(request);
    expect(budget.tokensToday).toBe(240);
  });

  it("stops when the daily token budget is reached", async () => {
    const { client, callStructured, request } = setUp(['{"answer":"x"}', '{"answer":"y"}'], 120);
    const first = await callStructured(request);
    const second = await callStructured(request);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: BUDGET_REACHED_ERROR, rejectedReplies: [] });
    expect(client.callCount).toBe(1);
  });

  it("accepts JSON wrapped in a markdown code fence", async () => {
    const { callStructured, request } = setUp(['```json\n{"answer":"fenced"}\n```']);
    const result = await callStructured(request);
    expect(result.ok && result.value).toEqual({ answer: "fenced" });
  });
});

describe("ConcurrencyLimiter", () => {
  it("limits concurrent calls", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const releases: (() => void)[] = [];
    let highestInFlight = 0;
    const tasks = Array.from({ length: 5 }, () =>
      limiter.run(async () => {
        highestInFlight = Math.max(highestInFlight, limiter.inFlightCount);
        await new Promise<void>((resolve) => releases.push(resolve));
      }),
    );
    await Promise.resolve();
    expect(limiter.inFlightCount).toBe(2);
    expect(limiter.queuedCount).toBe(3);
    while (releases.length > 0 || limiter.inFlightCount > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(tasks);
    expect(highestInFlight).toBe(2);
    expect(limiter.inFlightCount).toBe(0);
  });
});

describe("TokenBudget", () => {
  it("counts tokens per real calendar day and follows live budget changes", () => {
    let now = NOON;
    const budget = new TokenBudget(new InMemoryTokenUsageStore(), {
      dailyTokenBudget: 100,
      now: () => now,
    });
    budget.addTokens(150);
    expect(budget.isOverBudget()).toBe(true);
    budget.dailyTokenBudget = 200;
    expect(budget.isOverBudget()).toBe(false);
    now = new Date(2026, 10, 11, 0, 5, 0);
    expect(budget.tokensToday).toBe(0);
  });
});
