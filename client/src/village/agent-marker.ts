import * as Phaser from "phaser";
import type { Position } from "@village/shared";
import { clientConfig } from "../client-config";

export const AGENT_TEXTURE_KEY = "agent-figure";

const FIGURE_SIZE = 12;
const HEAD_RADIUS = 3;
const BODY_TOP = 5;
const BODY_WIDTH = 8;
const BODY_HEIGHT = 7;
const BODY_CORNER_RADIUS = 2;
const LABEL_OFFSET_Y = 7;
const LABEL_FONT_SIZE = "7px";
const RING_COLOR = 0xffffff;
const RING_LINE_WIDTH = 1;

/** Draws a white figure once; each agent tints it with its own color. */
export function createAgentTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(AGENT_TEXTURE_KEY)) return;
  const graphics = scene.add.graphics();
  const center = FIGURE_SIZE / 2;
  graphics.fillStyle(0xffffff, 1);
  graphics.fillCircle(center, HEAD_RADIUS, HEAD_RADIUS);
  graphics.fillRoundedRect(
    center - BODY_WIDTH / 2,
    BODY_TOP,
    BODY_WIDTH,
    BODY_HEIGHT,
    BODY_CORNER_RADIUS,
  );
  graphics.lineStyle(1, 0x000000, 0.8);
  graphics.strokeCircle(center, HEAD_RADIUS, HEAD_RADIUS);
  graphics.generateTexture(AGENT_TEXTURE_KEY, FIGURE_SIZE, FIGURE_SIZE);
  graphics.destroy();
}

export function tileCenter(position: Position): Position {
  const tileSize = clientConfig.map.tileSizePixels;
  return { x: position.x * tileSize + tileSize / 2, y: position.y * tileSize + tileSize / 2 };
}

/** One agent on the map: a tinted figure, a name label and a selection ring. */
export class AgentMarker {
  readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Arc;
  private tilePosition: Position;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly agentId: string,
    name: string,
    color: number,
    position: Position,
    onClick: (agentId: string) => void,
  ) {
    const center = tileCenter(position);
    this.tilePosition = position;
    this.ring = scene.add.circle(0, 0, clientConfig.village.selectionRingRadius);
    this.ring.setStrokeStyle(RING_LINE_WIDTH, RING_COLOR, 1).setVisible(false);
    const figure = scene.add.image(0, 0, AGENT_TEXTURE_KEY).setTint(color);
    figure.setInteractive({ useHandCursor: true });
    figure.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => onClick(agentId));
    const label = scene.add
      .text(0, LABEL_OFFSET_Y, name, {
        fontFamily: "monospace",
        fontSize: LABEL_FONT_SIZE,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setResolution(clientConfig.village.textResolution);
    this.container = scene.add.container(center.x, center.y, [this.ring, figure, label]);
  }

  get position(): Position {
    return this.tilePosition;
  }

  setSelected(isSelected: boolean): void {
    this.ring.setVisible(isSelected);
  }

  moveTo(position: Position, durationMs: number): void {
    this.tilePosition = position;
    const center = tileCenter(position);
    this.scene.tweens.killTweensOf(this.container);
    if (durationMs <= 0) {
      this.container.setPosition(center.x, center.y);
      return;
    }
    this.scene.tweens.add({
      targets: this.container,
      x: center.x,
      y: center.y,
      duration: durationMs,
      ease: "Linear",
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }
}
