import { useLayoutEffect, useRef, useState } from "react";
import { formatSimTime } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatClockTime } from "../format/character-sheet";
import type { ConversationThread, StageDirection } from "../format/conversations";
import {
  countThreadLines,
  describeThreadPreview,
  mergeSpeakerRuns,
  type SpeakerRun,
} from "../format/thread-view";
import { usePanelContext } from "./panel-context";
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
        <p key={line.eventId} className={`run-line volume-${line.volume}`}>
          {line.volume !== "normal" && <span className="line-volume">{line.volume}s</span>}
          <span className="line-words">{line.words}</span>
        </p>
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

/** Keeps a live thread scrolled to its newest line unless the reader has scrolled up to read. */
function useStickToBottom(lineCount: number, isLive: boolean) {
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
    if (isStuckRef.current || !isLive) {
      element.scrollTop = element.scrollHeight;
      seenLineCountRef.current = lineCount;
      setUnseenLineCount(0);
    } else {
      setUnseenLineCount(lineCount - seenLineCountRef.current);
    }
  }, [lineCount, isLive]);

  return { scrollRef, handleScroll, unseenLineCount, scrollToBottom };
}

function ThreadBody({ thread, isLive }: { thread: ConversationThread; isLive: boolean }) {
  const lineCount = thread.entries.length;
  const { scrollRef, handleScroll, unseenLineCount, scrollToBottom } = useStickToBottom(
    lineCount,
    isLive,
  );
  return (
    <div className="thread-body">
      <ol
        className="thread-lines"
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ maxHeight: clientConfig.ui.maxThreadHeightPx }}
      >
        {mergeSpeakerRuns(thread.entries).map((block) =>
          block.kind === "run" ? (
            <SpeakerRunBlock key={block.key} run={block} />
          ) : (
            <StageBlock key={block.eventId} direction={block} />
          ),
        )}
      </ol>
      {unseenLineCount > 0 && (
        <button className="new-lines-pill" onClick={scrollToBottom}>
          ↓ {unseenLineCount} new {unseenLineCount === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}

/** A conversation; live ones stay open, finished ones fold to a one-line preview. */
export function ThreadCard({ thread, isLive }: { thread: ConversationThread; isLive: boolean }) {
  const { state, focusThread, highlightAgents } = usePanelContext();
  const [isExpandedByReader, setIsExpandedByReader] = useState<boolean | null>(null);
  const isExpanded = isExpandedByReader ?? isLive;
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
          onClick={() => setIsExpandedByReader(!isExpanded)}
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
        <ThreadBody thread={thread} isLive={isLive} />
      ) : (
        <button className="thread-preview" onClick={() => setIsExpandedByReader(true)}>
          <strong>{preview.speakerName}:</strong> {preview.words}
        </button>
      )}
    </article>
  );
}
