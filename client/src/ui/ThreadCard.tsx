import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatSimTime } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatClockTime } from "../format/character-sheet";
import type { ConversationThread, StageDirection, ThreadEntry } from "../format/conversations";
import {
  countThreadLines,
  describeThreadPreview,
  mergeSpeakerRuns,
  type SpeakerRun,
  type ThreadBlock,
  type TimePause,
} from "../format/thread-view";
import { usePanelContext } from "./panel-context";
import { ThoughtReveal } from "./ThoughtReveal";
import { AgentName, ColorDot } from "./widgets";

function SpeakerRunBlock({ run }: { run: SpeakerRun }) {
  const { state, agentColors } = usePanelContext();
  const firstLine = run.lines[0];
  return (
    <li className="speaker-run" style={{ borderLeftColor: agentColors.get(run.speakerId) }}>
      <div className="speaker-run-header">
        <AgentName agentId={run.speakerId} name={run.speakerName} />
        {firstLine && (
          <span className="line-time">{formatClockTime(firstLine.tick, state.timeSettings)}</span>
        )}
      </div>
      {run.lines.map((line) => (
        <ThoughtReveal key={line.eventId} thought={line.thought}>
          <p className={`run-line volume-${line.volume}`}>
            {line.volume !== "normal" && <span className="line-volume">{line.volume}s</span>}
            <span className="line-words">{line.words}</span>
          </p>
        </ThoughtReveal>
      ))}
    </li>
  );
}

function StageBlock({ direction }: { direction: StageDirection }) {
  return (
    <li className="thread-stage">
      <AgentName agentId={direction.actorId} name={direction.actorName} /> {direction.text}
    </li>
  );
}

function PauseBlock({ pause }: { pause: TimePause }) {
  const { state } = usePanelContext();
  return (
    <li className="thread-pause" title={formatSimTime(pause.tick, state.timeSettings)}>
      {formatClockTime(pause.tick, state.timeSettings)}
    </li>
  );
}

function ChatBlock({ block }: { block: ThreadBlock }) {
  if (block.kind === "run") return <SpeakerRunBlock run={block} />;
  if (block.kind === "pause") return <PauseBlock pause={block} />;
  return <StageBlock direction={block} />;
}

/**
 * Whether a chat card is open. It opens when talk starts; going quiet never folds it, so the
 * feed doesn't shift under the reader. Only the reader folds it.
 */
export function useFoldState(isLive: boolean) {
  const [isExpanded, setIsExpanded] = useState(isLive);
  useEffect(() => {
    if (isLive) setIsExpanded(true);
  }, [isLive]);
  return [isExpanded, setIsExpanded] as const;
}

/** Keeps a thread scrolled to its newest line unless the reader has scrolled up to read. */
function useStickToBottom(lineCount: number) {
  const scrollRef = useRef<HTMLOListElement>(null);
  const isStuckRef = useRef(true);
  const seenLineCountRef = useRef(lineCount);
  const [unseenLineCount, setUnseenLineCount] = useState(0);

  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    isStuckRef.current = true;
    seenLineCountRef.current = lineCount;
    setUnseenLineCount(0);
  };

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    isStuckRef.current = distanceFromBottom <= clientConfig.ui.threadStickSlackPx;
    if (isStuckRef.current) {
      seenLineCountRef.current = lineCount;
      setUnseenLineCount(0);
    }
  };

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (isStuckRef.current) {
      element.scrollTop = element.scrollHeight;
      seenLineCountRef.current = lineCount;
      setUnseenLineCount(0);
    } else {
      setUnseenLineCount(lineCount - seenLineCountRef.current);
    }
  }, [lineCount]);

  return { scrollRef, handleScroll, unseenLineCount, scrollToBottom };
}

/** A scrolling chat of entries that follows new ones in, with a pause marker after long gaps. */
export function ThreadBody({
  entries,
  maxGapTicks,
}: {
  entries: ThreadEntry[];
  maxGapTicks?: number;
}) {
  const lineCount = entries.length;
  const { scrollRef, handleScroll, unseenLineCount, scrollToBottom } = useStickToBottom(lineCount);
  return (
    <div className="thread-body">
      <ol
        className="thread-lines"
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ maxHeight: clientConfig.ui.maxThreadHeightPx }}
      >
        {mergeSpeakerRuns(entries, maxGapTicks).map((block) => (
          <ChatBlock
            key={`${block.kind}-${block.kind === "stage" ? block.eventId : block.key}`}
            block={block}
          />
        ))}
      </ol>
      {unseenLineCount > 0 && (
        <button className="new-lines-pill" onClick={scrollToBottom}>
          ↓ {unseenLineCount} new {unseenLineCount === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}

/** A conversation; open once it starts, folded to a one-line preview only by the reader. */
export function ThreadCard({ thread, isLive }: { thread: ConversationThread; isLive: boolean }) {
  const { state, focusThread, highlightAgents } = usePanelContext();
  const [isExpanded, setIsExpanded] = useFoldState(isLive);
  const preview = describeThreadPreview(thread);
  const lineCount = countThreadLines(thread);

  return (
    <article
      className={isLive ? "thread is-ongoing" : "thread"}
      onPointerEnter={() => highlightAgents(thread.speakerIds)}
      onPointerLeave={() => highlightAgents([])}
    >
      <header className="thread-header">
        <button
          className="thread-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          title={isExpanded ? "Fold" : "Unfold"}
        >
          {isExpanded ? "▾" : "▸"}
        </button>
        <button
          className="thread-place"
          onClick={() => focusThread(thread.speakerIds)}
          title="Show on the map"
        >
          {thread.place}
        </button>
        <span className="thread-speakers" title={thread.speakerNames.join(", ")}>
          {thread.speakerIds.map((speakerId) => (
            <ColorDot key={speakerId} agentId={speakerId} />
          ))}
        </span>
        <span className="thread-when muted">
          {isLive && <span className="live-badge">live</span>}
          {formatSimTime(thread.startTick, state.timeSettings)}
          {` · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
        </span>
      </header>
      {isExpanded ? (
        <ThreadBody entries={thread.entries} />
      ) : (
        <button className="thread-preview" onClick={() => setIsExpanded(true)}>
          <strong>{preview.speakerName}:</strong> {preview.words}
        </button>
      )}
    </article>
  );
}
