import { useEffect, useState } from "react";
import type { Position } from "@village/shared";
import { clientConfig } from "../client-config";
import type { ConversationLink } from "./activity-cues";
import { computeMotionPosition, type AgentMotion } from "./agent-motion";
import { layOutBubbleStacks, type BubbleStackBox } from "./bubble-layout";
import { computeWorldTransform, mapToScreen, type Camera, type Size } from "./camera";
import type { TiledPlace } from "./tiled-map";
import { tileCenter } from "./village-geometry";

/** The marker figure's height in map pixels; bubbles and cues sit above it. */
export const FIGURE_SIZE = 16;

export interface ElementRegistry<ElementType extends Element = HTMLElement> {
  elements: Map<string, ElementType>;
  register: (id: string) => (element: ElementType | null) => void;
}

/** Stable callback refs keyed by id, so per-frame code can reach each element directly. */
export function useElementRegistry<
  ElementType extends Element = HTMLElement,
>(): ElementRegistry<ElementType> {
  const [registry] = useState<ElementRegistry<ElementType>>(() => {
    const elements = new Map<string, ElementType>();
    const refsById = new Map<string, (element: ElementType | null) => void>();
    const register = (id: string) => {
      const existing = refsById.get(id);
      if (existing) return existing;
      const ref = (element: ElementType | null) => {
        if (element) elements.set(id, element);
        else elements.delete(id);
      };
      refsById.set(id, ref);
      return ref;
    };
    return { elements, register };
  });
  return registry;
}

/**
 * The DOM the frame loop moves. The map layer is scaled by the camera; everything else is drawn
 * in screen pixels at a position taken from the map, so text stays readable at any zoom. Thought
 * clouds ride in the bubble stacks; the hover card is a single element placed beside its agent, the tile card beside its tile.
 */
export interface WorldElements {
  motions: Map<string, AgentMotion>;
  mapLayer: { current: HTMLDivElement | null };
  markers: ElementRegistry;
  bubbleStacks: ElementRegistry;
  leaderLines: ElementRegistry;
  placeLabels: ElementRegistry;
  linkLines: ElementRegistry<SVGLineElement>;
  hoverCard: { current: HTMLElement | null };
  tileCard: { current: HTMLElement | null };
}

/** What the frame loop needs from the latest render. */
export interface WorldScene {
  places: readonly TiledPlace[];
  links: readonly ConversationLink[];
  hoveredAgentId: string | null;
  /** The tile whose card is shown, in tile coordinates. */
  inspectedTile: Position | null;
  tileSize: number;
}

export interface WorldFrame {
  camera: Camera;
  view: Size;
  positions: ReadonlyMap<string, Position>;
}

export function computeAgentPositions(
  motions: ReadonlyMap<string, AgentMotion>,
  nowMs: number,
): Map<string, Position> {
  return new Map(
    [...motions].map(([agentId, motion]) => [agentId, computeMotionPosition(motion, nowMs)]),
  );
}

function placeElement(element: HTMLElement, x: number, y: number): void {
  element.style.transform = `translate(${x}px, ${y}px)`;
}

function layOutMarkers(
  world: WorldElements,
  screenPositions: ReadonlyMap<string, Position>,
  scale: number,
): void {
  for (const [agentId, markerElement] of world.markers.elements) {
    const position = screenPositions.get(agentId);
    if (!position) continue;
    placeElement(markerElement, position.x, position.y);
    markerElement.style.setProperty("--figure-scale", String(scale));
  }
}

function layOutLinks(
  world: WorldElements,
  scene: WorldScene,
  screenPositions: ReadonlyMap<string, Position>,
): void {
  for (const link of scene.links) {
    const line = world.linkLines.elements.get(link.key);
    if (!line) continue;
    const from = screenPositions.get(link.fromAgentId);
    const to = screenPositions.get(link.toAgentId);
    line.style.visibility = from && to ? "visible" : "hidden";
    if (!from || !to) continue;
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
  }
}

function layOutPlaceLabels(world: WorldElements, scene: WorldScene, frame: WorldFrame): void {
  for (const place of scene.places) {
    const label = world.placeLabels.elements.get(place.name);
    if (!label) continue;
    const topCenter = { x: place.x + place.width / 2, y: place.y };
    const anchor = mapToScreen(topCenter, frame.camera, frame.view);
    placeElement(label, anchor.x, anchor.y);
  }
}

/**
 * Places bubble stacks above their speakers so none overlap; a lifted stack shows a leader line
 * back down to its speaker. All reads happen before any writes so the browser lays out once.
 */
function layOutBubbles(
  world: WorldElements,
  screenPositions: ReadonlyMap<string, Position>,
  scale: number,
): void {
  const { speechBubbleGap, speechBubbleOffsetAboveFigure } = clientConfig.village;
  const lift = (FIGURE_SIZE / 2) * scale + speechBubbleOffsetAboveFigure;
  const stacks: BubbleStackBox[] = [];
  for (const [agentId, stackElement] of world.bubbleStacks.elements) {
    const anchor = screenPositions.get(agentId);
    if (!anchor) continue;
    stacks.push({
      agentId,
      anchorX: anchor.x,
      anchorBottom: anchor.y - lift,
      width: stackElement.offsetWidth,
      height: stackElement.offsetHeight,
    });
  }
  const bottomsByAgent = layOutBubbleStacks(stacks, speechBubbleGap);
  for (const [agentId, stackElement] of world.bubbleStacks.elements) {
    stackElement.style.visibility = screenPositions.has(agentId) ? "visible" : "hidden";
  }
  for (const stack of stacks) {
    const bottom = bottomsByAgent.get(stack.agentId) ?? stack.anchorBottom;
    const stackElement = world.bubbleStacks.elements.get(stack.agentId);
    if (stackElement) {
      placeElement(stackElement, stack.anchorX - stack.width / 2, bottom - stack.height);
    }
    const leaderLine = world.leaderLines.elements.get(stack.agentId);
    if (!leaderLine) continue;
    const leaderLength = stack.anchorBottom - bottom;
    leaderLine.style.display = leaderLength > speechBubbleGap ? "block" : "none";
    leaderLine.style.height = `${leaderLength}px`;
  }
}

/** Clamps a box's start so the box stays inside the view, a margin away from either edge. */
export function clampIntoView(
  start: number,
  length: number,
  viewLength: number,
  margin: number,
): number {
  const furthestStart = viewLength - length - margin;
  return Math.max(margin, Math.min(start, furthestStart));
}

/**
 * Puts a card beside a screen point, flipping to the left when it would run off the right;
 * `clearance` keeps it off the figure or tile it describes.
 */
function placeCardBeside(card: HTMLElement, anchor: Position, clearance: number, view: Size): void {
  const { hoverCardViewMarginPx } = clientConfig.village;
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const rightSideX = anchor.x + clearance;
  const fitsOnRight = rightSideX + width + hoverCardViewMarginPx <= view.width;
  const x = fitsOnRight ? rightSideX : anchor.x - clearance - width;
  placeElement(
    card,
    clampIntoView(x, width, view.width, hoverCardViewMarginPx),
    clampIntoView(anchor.y - height / 2, height, view.height, hoverCardViewMarginPx),
  );
}

function layOutHoverCard(
  world: WorldElements,
  scene: WorldScene,
  frame: WorldFrame,
  screenPositions: ReadonlyMap<string, Position>,
): void {
  const card = world.hoverCard.current;
  const anchor = scene.hoveredAgentId ? screenPositions.get(scene.hoveredAgentId) : undefined;
  if (!card || !anchor) return;
  placeCardBeside(card, anchor, clientConfig.village.hoverCardOffsetPx, frame.view);
}

function layOutTileCard(world: WorldElements, scene: WorldScene, frame: WorldFrame): void {
  const card = world.tileCard.current;
  if (!card || !scene.inspectedTile) return;
  const center = tileCenter(scene.inspectedTile, scene.tileSize);
  const anchor = mapToScreen(center, frame.camera, frame.view);
  const clearance =
    (scene.tileSize / 2) * frame.camera.zoom + clientConfig.village.hoverCardOffsetPx;
  placeCardBeside(card, anchor, clearance, frame.view);
}

/** Applies the camera to the map layer and moves every screen-space element for this frame. */
export function layOutWorld(world: WorldElements, scene: WorldScene, frame: WorldFrame): void {
  const screenPositions = new Map(
    [...frame.positions].map(([agentId, position]) => [
      agentId,
      mapToScreen(position, frame.camera, frame.view),
    ]),
  );
  // Figures scale exactly with the map, so an agent's glyph pixels match the tiles' pixels.
  const scale = frame.camera.zoom;
  if (world.mapLayer.current) {
    world.mapLayer.current.style.transform = computeWorldTransform(frame.camera, frame.view);
  }
  layOutBubbles(world, screenPositions, scale);
  layOutMarkers(world, screenPositions, scale);
  layOutLinks(world, scene, screenPositions);
  layOutPlaceLabels(world, scene, frame);
  layOutHoverCard(world, scene, frame, screenPositions);
  layOutTileCard(world, scene, frame);
}

/** Runs `renderFrame` every animation frame while mounted. */
export function useAnimationFrames(renderFrame: (nowMs: number) => void): void {
  useEffect(() => {
    let frameId = 0;
    const onFrame = (nowMs: number) => {
      renderFrame(nowMs);
      frameId = requestAnimationFrame(onFrame);
    };
    frameId = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(frameId);
  }, [renderFrame]);
}
