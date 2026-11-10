import * as Phaser from "phaser";
import type { Volume } from "@village/shared";
import { clientConfig } from "../clientConfig";

const BUBBLE_OFFSET_Y = -9;

const BUBBLE_STYLES: Record<Volume, Phaser.Types.GameObjects.Text.TextStyle> = {
  whisper: {
    fontFamily: "monospace",
    fontSize: "6px",
    fontStyle: "italic",
    color: "#d8d8e8",
    backgroundColor: "#3a3a52",
    padding: { x: 2, y: 1 },
  },
  normal: {
    fontFamily: "monospace",
    fontSize: "7px",
    color: "#111111",
    backgroundColor: "#f4f4f4",
    padding: { x: 3, y: 2 },
  },
  shout: {
    fontFamily: "monospace",
    fontSize: "8px",
    fontStyle: "bold",
    color: "#3a0000",
    backgroundColor: "#ffd23f",
    padding: { x: 3, y: 2 },
  },
};

interface Bubble {
  text: Phaser.GameObjects.Text;
  isFading: boolean;
}

/** Speech bubbles drawn above all agents, stacked newest-lowest per speaker, fading after a while. */
export class SpeechBubbleLayer {
  private readonly bubblesByAgent = new Map<string, Bubble[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  add(agentId: string, words: string, volume: Volume): void {
    const { speechBubbleWrapWidth, textResolution } = clientConfig.village;
    const text = this.scene.add
      .text(0, 0, words, {
        ...BUBBLE_STYLES[volume],
        wordWrap: { width: speechBubbleWrapWidth, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1)
      .setResolution(textResolution)
      .setDepth(this.depth);
    const bubble: Bubble = { text, isFading: false };
    const bubbles = this.bubblesByAgent.get(agentId) ?? [];
    bubbles.push(bubble);
    this.bubblesByAgent.set(agentId, bubbles);
    this.scene.time.delayedCall(clientConfig.village.speechBubbleLifetimeMs, () => {
      this.fadeOut(agentId, bubble);
    });
  }

  /** Keeps every stack above its speaker; call once per frame. */
  follow(findAnchor: (agentId: string) => { x: number; y: number } | null): void {
    for (const [agentId, bubbles] of this.bubblesByAgent) {
      const anchor = findAnchor(agentId);
      let bottom = (anchor?.y ?? 0) + BUBBLE_OFFSET_Y;
      for (let index = bubbles.length - 1; index >= 0; index -= 1) {
        const bubble = bubbles[index];
        if (!bubble) continue;
        bubble.text.setVisible(anchor !== null);
        bubble.text.setPosition(anchor?.x ?? 0, bottom);
        bottom -= bubble.text.height + clientConfig.village.speechBubbleGap;
      }
    }
  }

  clear(): void {
    for (const bubbles of this.bubblesByAgent.values()) {
      for (const bubble of bubbles) bubble.text.destroy();
    }
    this.bubblesByAgent.clear();
  }

  private fadeOut(agentId: string, bubble: Bubble): void {
    if (bubble.isFading || !bubble.text.active) return;
    bubble.isFading = true;
    this.scene.tweens.add({
      targets: bubble.text,
      alpha: 0,
      duration: clientConfig.village.speechBubbleFadeMs,
      onComplete: () => this.remove(agentId, bubble),
    });
  }

  private remove(agentId: string, bubble: Bubble): void {
    const remaining = (this.bubblesByAgent.get(agentId) ?? []).filter((item) => item !== bubble);
    if (remaining.length === 0) this.bubblesByAgent.delete(agentId);
    else this.bubblesByAgent.set(agentId, remaining);
    bubble.text.destroy();
  }
}
