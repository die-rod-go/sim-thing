import * as Phaser from "phaser";
import type { Volume } from "@village/shared";
import { clientConfig } from "../client-config";
import { layOutBubbleStacks, type BubbleStackBox } from "./bubble-layout";

const BUBBLE_OFFSET_Y = -9;
const LEADER_LINE_COLOR = 0xffffff;

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

interface Anchor {
  x: number;
  y: number;
}

/**
 * Speech bubbles drawn above all agents, stacked newest-lowest per speaker and fading after a
 * while. Stacks of nearby speakers are laid out together so they never overlap; a lifted stack
 * gets a leader line back to its speaker.
 */
export class SpeechBubbleLayer {
  private readonly bubblesByAgent = new Map<string, Bubble[]>();
  private readonly leaderLines: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    this.leaderLines = scene.add.graphics().setDepth(depth - 1);
  }

  add(agentId: string, speakerName: string, words: string, volume: Volume): void {
    const { speechBubbleWrapWidth, textResolution } = clientConfig.village;
    const text = this.scene.add
      .text(0, 0, `${speakerName}: ${words}`, {
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
    this.dropOverflow(agentId);
    this.scene.time.delayedCall(clientConfig.village.speechBubbleLifetimeMs, () => {
      this.fadeOut(agentId, bubble);
    });
  }

  /** Keeps every stack above its speaker without overlapping others; call once per frame. */
  follow(findAnchor: (agentId: string) => Anchor | null): void {
    const { speechBubbleGap } = clientConfig.village;
    const stacks: BubbleStackBox[] = [];
    for (const [agentId, bubbles] of this.bubblesByAgent) {
      const anchor = findAnchor(agentId);
      for (const bubble of bubbles) bubble.text.setVisible(anchor !== null);
      if (anchor) stacks.push(this.measureStack(agentId, bubbles, anchor));
    }
    const bottomsByAgent = layOutBubbleStacks(stacks, speechBubbleGap);
    this.leaderLines.clear();
    for (const stack of stacks) {
      const bottom = bottomsByAgent.get(stack.agentId) ?? stack.anchorBottom;
      const bubbles = this.bubblesByAgent.get(stack.agentId) ?? [];
      this.positionStack(bubbles, stack.anchorX, bottom);
      if (stack.anchorBottom - bottom > speechBubbleGap) {
        this.drawLeaderLine(bubbles, stack.anchorX, stack.anchorBottom, bottom);
      }
    }
  }

  clear(): void {
    for (const bubbles of this.bubblesByAgent.values()) {
      for (const bubble of bubbles) bubble.text.destroy();
    }
    this.bubblesByAgent.clear();
    this.leaderLines.clear();
  }

  private measureStack(agentId: string, bubbles: Bubble[], anchor: Anchor): BubbleStackBox {
    const { speechBubbleGap } = clientConfig.village;
    const width = Math.max(...bubbles.map((bubble) => bubble.text.width));
    const textHeights = bubbles.reduce((total, bubble) => total + bubble.text.height, 0);
    const height = textHeights + speechBubbleGap * (bubbles.length - 1);
    return { agentId, anchorX: anchor.x, anchorBottom: anchor.y + BUBBLE_OFFSET_Y, width, height };
  }

  private positionStack(bubbles: Bubble[], centerX: number, stackBottom: number): void {
    let bottom = stackBottom;
    for (let index = bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = bubbles[index];
      if (!bubble) continue;
      bubble.text.setPosition(centerX, bottom);
      bottom -= bubble.text.height + clientConfig.village.speechBubbleGap;
    }
  }

  private drawLeaderLine(bubbles: Bubble[], x: number, fromY: number, toY: number): void {
    const { speechBubbleLeaderLineWidth, speechBubbleLeaderLineAlpha } = clientConfig.village;
    const stackAlpha = Math.max(...bubbles.map((bubble) => bubble.text.alpha));
    this.leaderLines.lineStyle(
      speechBubbleLeaderLineWidth,
      LEADER_LINE_COLOR,
      speechBubbleLeaderLineAlpha * stackAlpha,
    );
    this.leaderLines.lineBetween(x, fromY, x, toY);
  }

  private dropOverflow(agentId: string): void {
    const bubbles = this.bubblesByAgent.get(agentId) ?? [];
    const overflow = bubbles.length - clientConfig.state.maxSpeechBubblesPerAgent;
    for (const bubble of bubbles.slice(0, Math.max(overflow, 0))) this.remove(agentId, bubble);
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
    this.scene.tweens.killTweensOf(bubble.text);
    bubble.text.destroy();
  }
}
