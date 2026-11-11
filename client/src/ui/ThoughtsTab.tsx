import { useMemo, useState } from "react";
import { formatSimTime, type AgentDetailMessage } from "@village/shared";
import { summarizeLlmCall, type ThoughtEntry } from "../format/thoughts";
import { usePanelContext } from "./panel-context";
import { EmptyNote } from "./widgets";

const KIND_LABELS: Record<ThoughtEntry["kind"], string> = {
  decision: "decided",
  interact: "while busy",
  morning: "morning",
  night: "night reflection",
  weekly: "weekly reflection",
};

const REFLECTION_KINDS: ReadonlySet<ThoughtEntry["kind"]> = new Set(["morning", "night", "weekly"]);

const SPEECH_LABELS: ReadonlySet<string> = new Set(["said", "whispered", "shouted"]);

function ThoughtCard({ entry }: { entry: ThoughtEntry }) {
  const { state } = usePanelContext();
  return (
    <article className={`thought thought-${entry.kind}`}>
      <header className="thought-meta">
        <span>{formatSimTime(entry.tick, state.timeSettings)}</span>
        <span className={`tag tag-${entry.kind}`}>{KIND_LABELS[entry.kind]}</span>
      </header>
      {entry.error && <p className="error-text">{entry.error}</p>}
      {entry.headline && <p className="thought-headline">{entry.headline}</p>}
      {entry.parts.length > 0 && (
        <dl className="thought-parts">
          {entry.parts.map((thoughtPart, partIndex) => (
            <div key={partIndex} className="thought-part">
              <dt>{thoughtPart.label}</dt>
              <dd className={SPEECH_LABELS.has(thoughtPart.label) ? "is-speech" : undefined}>
                {SPEECH_LABELS.has(thoughtPart.label) ? `“${thoughtPart.text}”` : thoughtPart.text}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** What the agent was thinking at each LLM call, newest first, without the raw prompt. */
export function ThoughtsTab({ detail }: { detail: AgentDetailMessage }) {
  const [isReflectionOnly, setIsReflectionOnly] = useState(false);
  const entries = useMemo(
    () =>
      [...detail.llmCalls]
        .sort((first, second) => second.id - first.id)
        .map(summarizeLlmCall)
        .filter((entry) => !isReflectionOnly || REFLECTION_KINDS.has(entry.kind)),
    [detail.llmCalls, isReflectionOnly],
  );
  return (
    <div className="thoughts">
      <label className="toggle small-toggle">
        <input
          type="checkbox"
          checked={isReflectionOnly}
          onChange={(event) => setIsReflectionOnly(event.target.checked)}
        />
        reflections only
      </label>
      {entries.length === 0 && <EmptyNote>No thoughts recorded yet.</EmptyNote>}
      {entries.map((entry) => (
        <ThoughtCard key={entry.callId} entry={entry} />
      ))}
    </div>
  );
}
