import type { LlmClient, LlmRequest, LlmResponse } from "./types";

export type FakeReply = string | Error | Partial<LlmResponse>;

export type FakeResponder = (
  request: LlmRequest,
  callIndex: number,
) => FakeReply | Promise<FakeReply>;

const FAKE_MODEL = "fake-model";
const FAKE_PROMPT_TOKENS = 100;
const FAKE_COMPLETION_TOKENS = 20;

/** An LLM client for tests and offline runs: replies from a queue or a function of the request. */
export class FakeLlmClient implements LlmClient {
  readonly model = FAKE_MODEL;
  readonly requests: LlmRequest[] = [];
  private readonly queuedReplies: FakeReply[];
  private readonly responder: FakeResponder | null;
  private readonly isKeepingRequests: boolean;
  private completedCount = 0;

  /** Long offline runs pass `isKeepingRequests: false` so requests don't pile up in memory. */
  constructor(
    replies: FakeReply[] | FakeResponder = [],
    options: { isKeepingRequests?: boolean } = {},
  ) {
    this.queuedReplies = Array.isArray(replies) ? [...replies] : [];
    this.responder = Array.isArray(replies) ? null : replies;
    this.isKeepingRequests = options.isKeepingRequests ?? true;
  }

  get callCount(): number {
    return this.completedCount;
  }

  queueReply(reply: FakeReply): void {
    this.queuedReplies.push(reply);
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const callIndex = this.completedCount;
    this.completedCount += 1;
    if (this.isKeepingRequests) this.requests.push(request);
    const reply = await this.nextReply(request, callIndex);
    if (reply instanceof Error) throw reply;
    const response = typeof reply === "string" ? { text: reply } : reply;
    return {
      text: response.text ?? "",
      promptTokens: response.promptTokens ?? FAKE_PROMPT_TOKENS,
      completionTokens: response.completionTokens ?? FAKE_COMPLETION_TOKENS,
      latencyMs: response.latencyMs ?? 0,
      model: response.model ?? FAKE_MODEL,
    };
  }

  private async nextReply(request: LlmRequest, callIndex: number): Promise<FakeReply> {
    if (this.responder) return this.responder(request, callIndex);
    const reply = this.queuedReplies.shift();
    if (reply === undefined)
      throw new Error(`FakeLlmClient has no reply queued for call ${callIndex}`);
    return reply;
  }
}
