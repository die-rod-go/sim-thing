import { z } from "zod";
import { config } from "../config";
import type { LlmEnv } from "./env";
import { readLlmEnv } from "./env";
import { estimateTokens } from "./open-ai-compatible-client";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";
import { toMessages } from "./types";

const messagesResponseSchema = z.object({
  model: z.string().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullish(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().nullish(),
      cache_creation_input_tokens: z.number().nullish(),
    })
    .nullish(),
});

interface TextBlock {
  type: "text";
  text: string;
  cache_control?: { type: string };
}

/** Splits text after each breakpoint offset, marking the end of every piece but the last for caching. */
export function splitIntoCachedBlocks(text: string, breakpoints: number[] = []): TextBlock[] {
  const offsets = [...new Set(breakpoints)]
    .filter((offset) => offset > 0 && offset < text.length)
    .sort((first, second) => first - second);
  const cacheControl = { type: config.llm.anthropicCacheType };
  const blocks: TextBlock[] = [];
  let start = 0;
  for (const offset of offsets) {
    blocks.push({ type: "text", text: text.slice(start, offset), cache_control: cacheControl });
    start = offset;
  }
  blocks.push({ type: "text", text: text.slice(start) });
  return blocks;
}

/** Talks to Anthropic's native Messages API, with prompt caching at the request's breakpoints. */
export class AnthropicClient implements LlmClient {
  readonly model: string;
  private readonly settings: LlmEnv;

  constructor(settings: LlmEnv = readLlmEnv()) {
    this.settings = settings;
    this.model = settings.model;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.llm.requestTimeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${this.settings.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.settings.apiKey,
          "anthropic-version": config.llm.anthropicVersion,
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
      const message = messagesResponseSchema.parse(JSON.parse(bodyText));
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      const usage = message.usage;
      const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
      const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;
      const promptText = toMessages(request)
        .map((entry) => entry.content)
        .join("\n");
      return {
        text,
        promptTokens:
          usage?.input_tokens === undefined
            ? estimateTokens(promptText)
            : usage.input_tokens + cacheReadTokens + cacheWriteTokens,
        completionTokens: usage?.output_tokens ?? estimateTokens(text),
        cacheReadTokens,
        cacheWriteTokens,
        latencyMs,
        model: message.model ?? request.model ?? this.model,
        wasCutOff: message.stop_reason === "max_tokens",
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
    const entries = toMessages(request);
    const systemText = entries
      .filter((entry) => entry.role === "system")
      .map((entry) => entry.content)
      .join("\n\n");
    const conversation = entries.filter((entry) => entry.role !== "system");
    const lastIndex = conversation.length - 1;
    const messages = conversation.map((entry, index) => ({
      role: entry.role,
      content:
        index === lastIndex && entry.role === "user"
          ? splitIntoCachedBlocks(entry.content, request.cacheBreakpoints)
          : entry.content,
    }));
    const isStrictSchema = this.settings.isStructuredOutputEnabled && request.jsonSchema;
    return {
      model: request.model ?? this.model,
      max_tokens: request.maxTokens,
      ...(systemText ? { system: systemText } : {}),
      messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(isStrictSchema
        ? { output_config: { format: { type: "json_schema", schema: request.jsonSchema } } }
        : {}),
      ...(this.settings.isThinkingDisabled && !request.shouldThink
        ? { thinking: { type: "disabled" } }
        : {}),
    };
  }
}
