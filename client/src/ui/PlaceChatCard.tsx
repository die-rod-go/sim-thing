import { useState } from "react";
import { formatSimTime } from "@village/shared";
import { clientConfig } from "../client-config";
import type { SpokenLine } from "../format/conversations";
import type { PlaceChat } from "../format/story-feed";
import { usePanelContext } from "./panel-context";
import { ThreadBody } from "./ThreadCard";
import { ColorDot } from "./widgets";

function findLatestLine(chat: PlaceChat): SpokenLine | null {
  const lines = chat.entries.filter((entry): entry is SpokenLine => entry.kind === "line");
  return lines[lines.length - 1] ?? null;
}

/** One place's chat: open while people are talking there, folded to its latest line once quiet. */
export function PlaceChatCard({ chat }: { chat: PlaceChat }) {
  const { state, focusThread, highlightAgents } = usePanelContext();
  const [isExpandedByReader, setIsExpandedByReader] = useState<boolean | null>(null);
  const isExpanded = isExpandedByReader ?? chat.isLive;
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
          onClick={() => setIsExpandedByReader(!isExpanded)}
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
        <ThreadBody
          entries={chat.entries}
          isLive={chat.isLive}
          maxGapTicks={clientConfig.conversations.maxGapTicks}
        />
      ) : (
        latestLine && (
          <button className="thread-preview" onClick={() => setIsExpandedByReader(true)}>
            <strong>{latestLine.speakerName}:</strong> {latestLine.words}
          </button>
        )
      )}
    </article>
  );
}
