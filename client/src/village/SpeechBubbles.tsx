import { useCallback, useState } from "react";
import { clientConfig } from "../client-config";
import type { SpeechBubble } from "../state/client-state";

/**
 * Bubbles still on screen. Each bubble fades by CSS animation after its lifetime and is dropped
 * here when the fade ends; the client state keeps only the newest few per speaker.
 */
export function useLiveSpeechBubbles(speechBubbles: SpeechBubble[]) {
  const [expiredBubbles, setExpiredBubbles] = useState<ReadonlySet<SpeechBubble>>(new Set());
  const expireBubble = useCallback(
    (bubble: SpeechBubble) => {
      setExpiredBubbles((previous) => {
        const stillPresent = [...previous].filter((expired) => speechBubbles.includes(expired));
        return new Set([...stillPresent, bubble]);
      });
    },
    [speechBubbles],
  );
  const liveBubbles = speechBubbles.filter((bubble) => !expiredBubbles.has(bubble));
  return { liveBubbles, expireBubble };
}

export function groupBubblesBySpeaker(bubbles: SpeechBubble[]): Map<string, SpeechBubble[]> {
  const bubblesBySpeaker = new Map<string, SpeechBubble[]>();
  for (const bubble of bubbles) {
    bubblesBySpeaker.set(bubble.agentId, [...(bubblesBySpeaker.get(bubble.agentId) ?? []), bubble]);
  }
  return bubblesBySpeaker;
}

interface SpeechBubbleStackProps {
  speakerName: string;
  bubbles: SpeechBubble[];
  bubbleKeys: (bubble: SpeechBubble) => number;
  stackRef: (element: HTMLElement | null) => void;
  leaderLineRef: (element: HTMLElement | null) => void;
  onExpire: (bubble: SpeechBubble) => void;
}

/** One speaker's bubbles, oldest on top; world-layout positions the whole stack each frame. */
export function SpeechBubbleStack({
  speakerName,
  bubbles,
  bubbleKeys,
  stackRef,
  leaderLineRef,
  onExpire,
}: SpeechBubbleStackProps) {
  const {
    speechBubbleGap,
    speechBubbleWrapWidth,
    speechBubbleLifetimeMs,
    speechBubbleFadeMs,
    speechBubbleLeaderLineWidth,
    speechBubbleLeaderLineAlpha,
  } = clientConfig.village;
  return (
    <div className="speech-stack" ref={stackRef} style={{ gap: speechBubbleGap }}>
      {bubbles.map((bubble) => (
        <div
          key={bubbleKeys(bubble)}
          className={`speech-bubble speech-bubble-${bubble.volume}`}
          style={{
            maxWidth: speechBubbleWrapWidth,
            animationDelay: `${speechBubbleLifetimeMs}ms`,
            animationDuration: `${speechBubbleFadeMs}ms`,
          }}
          onAnimationEnd={() => onExpire(bubble)}
        >
          {speakerName}: {bubble.text}
        </div>
      ))}
      <div
        className="speech-leader-line"
        ref={leaderLineRef}
        style={{ width: speechBubbleLeaderLineWidth, opacity: speechBubbleLeaderLineAlpha }}
      />
    </div>
  );
}
