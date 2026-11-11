import { z } from "zod";
import { config } from "../config";
import type { LlmEnv } from "./env";
import { readLlmEnv } from "./env";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";
import { toMessages } from "./types";

const chatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullish(),
});

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / config.decision.charsPerToken);
}

/** Talks to any OpenAI-compatible `/chat/completions` endpoint (OpenRouter, Ollama, ...). */
export class OpenAiCompatibleClient implements LlmClient {
  readonly model: string;
  private readonly settings: LlmEnv;

  constructor(settings: LlmEnv = readLlmEnv()) {
    this.settings = settings;
    this.model = settings.model;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const messages = toMessages(request);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.llm.requestTimeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${this.settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
          "X-Title": config.llm.appTitle,
        },
        body: JSON.stringify(this.buildRequestBody(request)),
        signal: abortController.signal,
      });
      const bodyText = await response.text();
      const latencyMs = Math.round(performance.now() - startedAt);
      if (!response.ok) {
        const preview = bodyText.slice(0, config.llm.errorBodyPreviewChars);
        throw new Error(`LLM request failed with HTTP ${response.status}: ${preview}`);
      }
      const completion = chatCompletionSchema.parse(JSON.parse(bodyText));
      const text = completion.choices[0]?.message.content ?? "";
      const promptText = messages.map((message) => message.content).join("\n");
      return {
        text,
        promptTokens: completion.usage?.prompt_tokens ?? estimateTokens(promptText),
        completionTokens: completion.usage?.completion_tokens ?? estimateTokens(text),
        latencyMs,
        model: completion.model ?? this.model,
        wasCutOff: completion.choices[0]?.finish_reason === "length",
      };
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(`LLM request timed out after ${config.llm.requestTimeoutMs} ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequestBody(request: LlmRequest): Record<string, unknown> {
    const isStrictSchema = this.settings.isStructuredOutputEnabled && request.jsonSchema;
    // Without a strict schema, send no response_format: some providers (Anthropic's endpoint)
    // reject json_object, and every prompt already asks for a bare JSON object.
    const responseFormat = isStrictSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName ?? "reply",
              strict: true,
              schema: request.jsonSchema,
            },
          },
        }
      : {};
    return {
      model: this.model,
      messages: toMessages(request),
      max_tokens: request.maxTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...responseFormat,
    };
  }
}
