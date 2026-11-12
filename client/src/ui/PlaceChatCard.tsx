import { formatSimTime } from "@village/shared";
import { clientConfig } from "../client-config";
import type { SpokenLine } from "../format/conversations";
import type { PlaceChat } from "../format/story-feed";
import { usePanelContext } from "./panel-context";
import { ThreadBody, useFoldState } from "./ThreadCard";
import { ColorDot } from "./widgets";

function findLatestLine(chat: PlaceChat): SpokenLine | null {
  const lines = chat.entries.filter((entry): entry is SpokenLine => entry.kind === "line");
  return lines[lines.length - 1] ?? null;
}

/** One place's chat: opens when people talk there; only the reader folds it to its latest line. */
export function PlaceChatCard({ chat }: { chat: PlaceChat }) {
  const { state, focusThread, highlightAgents } = usePanelContext();
  const [isExpanded, setIsExpanded] = useFoldState(chat.isLive);
  const latestLine = findLatestLine(chat);

  return (
    <article
      className={chat.isLive ? "thread is-ongoing" : "thread"}
      onPointerEnter={() => highlightAgents(chat.recentSpeakerIds)}
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
          onClick={() => focusThread(chat.recentSpeakerIds)}
          title="Show on the map"
        >
          {chat.place}
        </button>
        <span className="thread-speakers" title={chat.recentSpeakerNames.join(", ")}>
          {chat.recentSpeakerIds.map((speakerId) => (
            <ColorDot key={speakerId} agentId={speakerId} />
          ))}
        </span>
        <span className="thread-when muted">
          {chat.isLive && <span className="live-badge">live</span>}
          {formatSimTime(chat.lastSpokenTick, state.timeSettings)}
        </span>
      </header>
      {isExpanded ? (
        <ThreadBody entries={chat.entries} maxGapTicks={clientConfig.conversations.maxGapTicks} />
      ) : (
        latestLine && (
          <button className="thread-preview" onClick={() => setIsExpanded(true)}>
            <strong>{latestLine.speakerName}:</strong> {latestLine.words}
          </button>
        )
      )}
    </article>
  );
}
