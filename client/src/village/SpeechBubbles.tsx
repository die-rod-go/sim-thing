import { useCallback, useState, type CSSProperties } from "react";
import { clientConfig } from "../client-config";
import type { SpeechBubble } from "../state/client-state";
import type { VisibleThought } from "./thought-bubbles";

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
  speakerColor: string;
  bubbles: readonly SpeechBubble[];
  thought: VisibleThought | null;
  bubbleKeys: (bubble: SpeechBubble) => number;
  stackRef: (element: HTMLElement | null) => void;
  leaderLineRef: (element: HTMLElement | null) => void;
  onExpire: (bubble: SpeechBubble) => void;
}

/**
 * Everything over one agent's head: its thought cloud on top, then its speech bubbles, oldest
 * first. World-layout positions the whole stack each frame, so the two never overlap.
 */
export function SpeechBubbleStack({
  speakerName,
  speakerColor,
  bubbles,
  thought,
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
    speechBubbleSpeakerTint,
    speechBubbleFontSizes,
    thoughtBubbleWrapWidth,
    thoughtBubbleFontSize,
  } = clientConfig.village;
  const speakerTintStyle = {
    "--speaker-color": speakerColor,
    "--speaker-tint": `${speechBubbleSpeakerTint * 100}%`,
    "--font-size-whisper": `${speechBubbleFontSizes.whisper}px`,
    "--font-size-normal": `${speechBubbleFontSizes.normal}px`,
    "--font-size-shout": `${speechBubbleFontSizes.shout}px`,
  } as CSSProperties;
  return (
    <div
      className="speech-stack"
      ref={stackRef}
      style={{ gap: speechBubbleGap, ...speakerTintStyle }}
    >
      {thought && (
        <div
          className="thought-bubble"
          style={{ maxWidth: thoughtBubbleWrapWidth, fontSize: thoughtBubbleFontSize }}
          title={`${speakerName} thinks: ${thought.fullText}`}
        >
          {thought.shortText}
        </div>
      )}
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
          {bubble.text}
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
