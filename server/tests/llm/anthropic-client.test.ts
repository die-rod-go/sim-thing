import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicClient, splitIntoCachedBlocks } from "../../src/llm/anthropic-client";
import type { LlmEnv } from "../../src/llm/env";

const settings: LlmEnv = {
  baseUrl: "https://api.example/v1",
  apiKey: "test-key",
  model: "claude-test",
  isStructuredOutputEnabled: true,
  isThinkingDisabled: true,
};

const replySchema = { type: "object", properties: {}, required: [], additionalProperties: false };

function stubFetch(responseBody: unknown, status = 200) {
  const fetchStub = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(responseBody), { status }),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function sentBody(fetchStub: ReturnType<typeof stubFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchStub.mock.calls[0]?.[1].body)) as Record<string, unknown>;
}

const message = {
  model: "claude-test-2026",
  content: [{ type: "text", text: '{"ok":true}' }],
  stop_reason: "end_turn",
  usage: {
    input_tokens: 100,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 50,
    output_tokens: 12,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("splitIntoCachedBlocks", () => {
  it("marks the end of each part before a breakpoint for caching", () => {
    const blocks = splitIntoCachedBlocks("aaabbbccc", [3, 6]);
    expect(blocks.map((block) => block.text)).toEqual(["aaa", "bbb", "ccc"]);
    expect(blocks.map((block) => block.cache_control !== undefined)).toEqual([true, true, false]);
  });

  it("sends one plain block when there are no usable breakpoints", () => {
    expect(splitIntoCachedBlocks("abc", [0, 3, 9])).toEqual([{ type: "text", text: "abc" }]);
  });
});

describe("AnthropicClient", () => {
  it("posts to the messages endpoint with the schema as output_config and cached blocks", async () => {
    const fetchStub = stubFetch(message);
    const client = new AnthropicClient(settings);
    await client.complete({
      prompt: "sharedvolatile",
      cacheBreakpoints: [6],
      jsonSchema: replySchema,
      maxTokens: 50,
    });
    expect(fetchStub.mock.calls[0]?.[0]).toBe("https://api.example/v1/messages");
    const headers = fetchStub.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = sentBody(fetchStub);
    expect(body).toMatchObject({
      model: "claude-test",
      max_tokens: 50,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: replySchema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "shared", cache_control: { type: "ephemeral" } },
            { type: "text", text: "volatile" },
          ],
        },
      ],
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("reports total input tokens and the cache split", async () => {
    stubFetch(message);
    const response = await new AnthropicClient(settings).complete({ prompt: "hi", maxTokens: 50 });
    expect(response).toMatchObject({
      text: '{"ok":true}',
      promptTokens: 1150,
      completionTokens: 12,
      cacheReadTokens: 1000,
      cacheWriteTokens: 50,
      wasCutOff: false,
    });
  });

  it("reports a reply that stopped at max_tokens as cut off", async () => {
    stubFetch({ ...message, stop_reason: "max_tokens" });
    const response = await new AnthropicClient(settings).complete({ prompt: "hi", maxTokens: 5 });
    expect(response.wasCutOff).toBe(true);
  });

  it("moves system messages to the top-level system field", async () => {
    const fetchStub = stubFetch(message);
    await new AnthropicClient(settings).complete({
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
      maxTokens: 5,
    });
    expect(sentBody(fetchStub)).toMatchObject({ system: "be brief" });
  });

  it("throws with the status on an HTTP error without leaking the key", async () => {
    stubFetch({ error: "overloaded" }, 529);
    const failure = new AnthropicClient(settings).complete({ prompt: "hi", maxTokens: 5 });
    await expect(failure).rejects.toThrow(/HTTP 529/);
    await expect(failure).rejects.not.toThrow(/test-key/);
  });
});
