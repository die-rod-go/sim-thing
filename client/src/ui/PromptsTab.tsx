import { formatSimTime, type AgentDetailMessage, type LlmCallRecord } from "@village/shared";
import { formatCount, formatLatency, formatParsedReply } from "../format/formatters";
import { splitPromptSections } from "../format/split-prompt-sections";
import { usePanelContext } from "./panel-context";
import { EmptyNote } from "./widgets";

function PromptSections({ prompt }: { prompt: string }) {
  return (
    <div className="prompt-sections">
      {splitPromptSections(prompt).map((section, sectionIndex) => (
        <details key={sectionIndex} className="prompt-section" open>
          <summary>{section.title ?? "(preamble)"}</summary>
          <pre className="mono">{section.body}</pre>
        </details>
      ))}
    </div>
  );
}

function LlmCallEntry({ call }: { call: LlmCallRecord }) {
  const { state } = usePanelContext();
  const totalTokens = call.promptTokens + call.completionTokens;
  return (
    <details className={call.error ? "llm-call has-error" : "llm-call"}>
      <summary>
        <span className={`tag tag-${call.kind}`}>{call.kind}</span>
        <span>{formatSimTime(call.tick, state.timeSettings)}</span>
        <span className="muted">tick {call.tick}</span>
        <span className="muted">{formatCount(totalTokens)} tok</span>
        <span className="muted">{formatLatency(call.latencyMs)}</span>
        {call.error && <span className="error-text">error</span>}
      </summary>
      <div className="llm-call-body">
        <dl className="facts">
          <dt>Model</dt>
          <dd className="mono">{call.model}</dd>
          <dt>Tokens</dt>
          <dd>
            {formatCount(call.promptTokens)} prompt + {formatCount(call.completionTokens)}{" "}
            completion
          </dd>
          <dt>Latency</dt>
          <dd>{formatLatency(call.latencyMs)}</dd>
          {call.error && (
            <>
              <dt>Error</dt>
              <dd className="error-text">{call.error}</dd>
            </>
          )}
        </dl>
        <details className="call-part" open>
          <summary>Prompt</summary>
          <PromptSections prompt={call.prompt} />
        </details>
        <details className="call-part" open>
          <summary>Raw reply</summary>
          <pre className="mono">{call.reply || "(empty)"}</pre>
        </details>
        <details className="call-part" open>
          <summary>Parsed</summary>
          <pre className="mono">{formatParsedReply(call.parsed)}</pre>
        </details>
      </div>
    </details>
  );
}

export function PromptsTab({ detail }: { detail: AgentDetailMessage }) {
  const calls = [...detail.llmCalls].sort((first, second) => second.id - first.id);
  if (calls.length === 0) return <EmptyNote>No LLM calls for {detail.agent.name} yet.</EmptyNote>;
  return (
    <div className="prompts-tab">
      {calls.map((call) => (
        <LlmCallEntry key={call.id} call={call} />
      ))}
    </div>
  );
}
