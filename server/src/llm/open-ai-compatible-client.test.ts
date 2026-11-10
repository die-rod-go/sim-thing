import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmEnv } from "./env";
import { readLlmEnv } from "./env";
import { OpenAiCompatibleClient } from "./open-ai-compatible-client";

const settings: LlmEnv = {
  baseUrl: "https://llm.example/api/v1",
  apiKey: "test-key",
  model: "test/model",
  isStructuredOutputEnabled: true,
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
  const init = fetchStub.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

const completion = {
  model: "test/model-2026",
  choices: [{ message: { content: '{"ok":true}' } }],
  usage: { prompt_tokens: 321, completion_tokens: 12 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleClient", () => {
  it("sends a strict json_schema response format and parses usage", async () => {
    const fetchStub = stubFetch(completion);
    const client = new OpenAiCompatibleClient(settings);
    const response = await client.complete({
      prompt: "hello",
      jsonSchema: replySchema,
      schemaName: "decision_reply",
      maxTokens: 50,
      temperature: 0.5,
    });
    expect(fetchStub.mock.calls[0]?.[0]).toBe("https://llm.example/api/v1/chat/completions");
    const headers = fetchStub.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(sentBody(fetchStub)).toEqual({
      model: "test/model",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 50,
      temperature: 0.5,
      response_format: {
        type: "json_schema",
        json_schema: { name: "decision_reply", strict: true, schema: replySchema },
      },
    });
    expect(response).toMatchObject({
      text: '{"ok":true}',
      promptTokens: 321,
      completionTokens: 12,
      model: "test/model-2026",
    });
  });

  it("falls back to json_object mode when structured output is off", async () => {
    const fetchStub = stubFetch(completion);
    const client = new OpenAiCompatibleClient({ ...settings, isStructuredOutputEnabled: false });
    await client.complete({ prompt: "hi", jsonSchema: replySchema, maxTokens: 50, temperature: 0 });
    expect(sentBody(fetchStub).response_format).toEqual({ type: "json_object" });
  });

  it("estimates tokens from length when usage is missing", async () => {
    stubFetch({ choices: [{ message: { content: "12345678" } }] });
    const client = new OpenAiCompatibleClient(settings);
    const response = await client.complete({ prompt: "abcd", maxTokens: 50, temperature: 0 });
    expect(response.promptTokens).toBe(1);
    expect(response.completionTokens).toBe(2);
    expect(response.model).toBe("test/model");
  });

  it("throws with the status on an HTTP error without leaking the key", async () => {
    stubFetch({ error: "rate limited" }, 429);
    const client = new OpenAiCompatibleClient(settings);
    const failure = client.complete({ prompt: "hi", maxTokens: 50, temperature: 0 });
    await expect(failure).rejects.toThrow(/HTTP 429/);
    await expect(failure).rejects.not.toThrow(/test-key/);
  });
});

describe("readLlmEnv", () => {
  it("throws naming the missing variables", () => {
    expect(() => readLlmEnv({ LLM_BASE_URL: "https://x" })).toThrow(/LLM_API_KEY, LLM_MODEL/);
  });

  it("reads structured output as on unless set to false", () => {
    const environment = { LLM_BASE_URL: "https://x/", LLM_API_KEY: "key", LLM_MODEL: "model" };
    expect(readLlmEnv(environment)).toMatchObject({
      baseUrl: "https://x",
      isStructuredOutputEnabled: true,
    });
    expect(readLlmEnv({ ...environment, LLM_STRUCTURED_OUTPUT: "false" })).toMatchObject({
      isStructuredOutputEnabled: false,
    });
  });
});
