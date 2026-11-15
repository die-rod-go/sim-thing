import { useState } from "react";
import type {
  ActivityAction,
  ActivityFailures,
  ActivityItem,
  ActivityMoment,
  ActivitySpeech,
  ActivityThought,
} from "../format/agent-activity";
import { CATEGORY_GLYPHS } from "../format/event-feed";
import { describeMomentDetail, MOMENT_GLYPHS, MOMENT_LABELS } from "../format/moments";
import { ThoughtReveal } from "./ThoughtReveal";
import { AgentName } from "./widgets";

const THOUGHT_LABELS: Record<ActivityThought["thoughtKind"], string> = {
  decision: "thought",
  interact: "thought, while busy",
  episode: "remembering the last while",
  chronicle: "remembering the last hours",
  day_summary: "remembering the day",
  history: "remembering what came before",
  people: "thinking about people",
  short_term_goals: "planning the next hours",
  identity: "looking at who they are",
  long_term_goals: "rethinking long-term goals",
  latest: "thought",
};

/** Opens the Prompts tab at a call, when that call is among the loaded ones. */
export interface PromptLink {
  loadedCallIds: ReadonlySet<number>;
  viewPrompt: (callId: number) => void;
}

function findPromptOpener(link: PromptLink, callId: number | null): (() => void) | undefined {
  if (callId === null || !link.loadedCallIds.has(callId)) return undefined;
  return () => link.viewPrompt(callId);
}

function ThoughtItem({ item, link }: { item: ActivityThought; link: PromptLink }) {
  const openPrompt = findPromptOpener(link, item.callId);
  return (
    <div className={`activity-thought thought-kind-${item.thoughtKind}`}>
      <span className="activity-label">
        {THOUGHT_LABELS[item.thoughtKind]}
        {openPrompt && (
          <button className="text-button" onClick={openPrompt}>
            view prompt
          </button>
        )}
      </span>
      {item.error && <p className="error-text">{item.error}</p>}
      {item.headline && <p className="activity-thought-text">{item.headline}</p>}
      {item.parts.length > 0 && (
        <dl className="activity-thought-parts">
          {item.parts.map((thoughtPart, partIndex) => (
            <div key={partIndex}>
              <dt>{thoughtPart.label}</dt>
              <dd>{thoughtPart.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ActionItem({ item }: { item: ActivityAction }) {
  return (
    <div className={`activity-action category-${item.category} feed-${item.eventKind}`}>
      <span className="feed-glyph">{CATEGORY_GLYPHS[item.category]}</span>
      <span>
        {item.text}
        {item.category !== "movement" && <span className="feed-place"> · {item.place}</span>}
      </span>
    </div>
  );
}

function FailuresItem({ item }: { item: ActivityFailures }) {
  const [isUnfolded, setIsUnfolded] = useState(false);
  return (
    <div className="activity-failures">
      <button className="text-button" onClick={() => setIsUnfolded(!isUnfolded)}>
        {isUnfolded ? "▾" : "▸"} {item.failures.length} failed attempts
      </button>
      {isUnfolded &&
        item.failures.map((failure) => <ActionItem key={failure.key} item={failure} />)}
    </div>
  );
}

function MomentItem({ item }: { item: ActivityMoment }) {
  const detail = describeMomentDetail(item.moment);
  return (
    <div className={`activity-moment moment-${item.moment.kind}`}>
      <span className="activity-label">
        {MOMENT_GLYPHS[item.moment.kind]} {MOMENT_LABELS[item.moment.kind]}
      </span>
      <p className="activity-moment-text">{item.moment.text}</p>
      {detail && <p className="activity-moment-detail muted">{detail}</p>}
    </div>
  );
}

function SpeechItem({ item, link }: { item: ActivitySpeech; link: PromptLink }) {
  return (
    <div className={`activity-speech volume-${item.volume}`}>
      {item.replyTo && (
        <p className="activity-reply-to">
          <AgentName agentId={item.replyTo.speakerId} name={item.replyTo.speakerName} />:{" "}
          <span className="muted">{item.replyTo.words}</span>
        </p>
      )}
      <ThoughtReveal
        thought={item.isThoughtShownAbove ? null : item.thought}
        onViewPrompt={findPromptOpener(link, item.llmCallId)}
      >
        <p className="activity-said">
          {item.volume !== "normal" && <span className="line-volume">{item.volume}s</span>}
          <span className="line-words">“{item.words}”</span>
          <span className="feed-place"> · {item.place}</span>
        </p>
      </ThoughtReveal>
    </div>
  );
}

export function ActivityItemView({ item, link }: { item: ActivityItem; link: PromptLink }) {
  switch (item.kind) {
    case "thought":
      return <ThoughtItem item={item} link={link} />;
    case "action":
      return <ActionItem item={item} />;
    case "failures":
      return <FailuresItem item={item} />;
    case "moment":
      return <MomentItem item={item} />;
    case "speech":
      return <SpeechItem item={item} link={link} />;
  }
}
