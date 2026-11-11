import { useEffect, useState } from "react";
import { clientConfig } from "../client-config";
import { computeMotionPosition, type AgentMotion } from "./agent-motion";
import { layOutBubbleStacks, type BubbleStackBox } from "./bubble-layout";

/** How far above a marker's center its bubble stack starts, in map pixels. */
const BUBBLE_OFFSET_Y = -9;

export interface ElementRegistry {
  elements: Map<string, HTMLElement>;
  register: (id: string) => (element: HTMLElement | null) => void;
}

/** Stable callback refs keyed by id, so per-frame code can reach each element directly. */
export function useElementRegistry(): ElementRegistry {
  const [registry] = useState<ElementRegistry>(() => {
    const elements = new Map<string, HTMLElement>();
    const refsById = new Map<string, (element: HTMLElement | null) => void>();
    const register = (id: string) => {
      const existing = refsById.get(id);
      if (existing) return existing;
      const ref = (element: HTMLElement | null) => {
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

export interface WorldElements {
  motions: Map<string, AgentMotion>;
  markers: ElementRegistry;
  bubbleStacks: ElementRegistry;
  leaderLines: ElementRegistry;
}

function placeElement(element: HTMLElement, x: number, y: number): void {
  element.style.transform = `translate(${x}px, ${y}px)`;
}

/**
 * Moves markers along their glides, then places bubble stacks above their speakers so none
 * overlap; a lifted stack shows a leader line back down to its speaker. All reads happen before
 * any writes so the browser lays out once per frame.
 */
export function layOutWorld(world: WorldElements, nowMs: number): void {
  const { speechBubbleGap } = clientConfig.village;
  const positions = new Map(
    [...world.motions].map(([agentId, motion]) => [agentId, computeMotionPosition(motion, nowMs)]),
  );
  const stacks: BubbleStackBox[] = [];
  for (const [agentId, stackElement] of world.bubbleStacks.elements) {
    const anchor = positions.get(agentId);
    if (!anchor) continue;
    stacks.push({
      agentId,
      anchorX: anchor.x,
      anchorBottom: anchor.y + BUBBLE_OFFSET_Y,
      width: stackElement.offsetWidth,
      height: stackElement.offsetHeight,
    });
  }
  const bottomsByAgent = layOutBubbleStacks(stacks, speechBubbleGap);

  for (const [agentId, markerElement] of world.markers.elements) {
    const position = positions.get(agentId);
    if (position) placeElement(markerElement, position.x, position.y);
  }
  for (const [agentId, stackElement] of world.bubbleStacks.elements) {
    stackElement.style.visibility = positions.has(agentId) ? "visible" : "hidden";
  }
  for (const stack of stacks) {
    const bottom = bottomsByAgent.get(stack.agentId) ?? stack.anchorBottom;
    const stackElement = world.bubbleStacks.elements.get(stack.agentId);
    if (stackElement)
      placeElement(stackElement, stack.anchorX - stack.width / 2, bottom - stack.height);
    const leaderLine = world.leaderLines.elements.get(stack.agentId);
    if (!leaderLine) continue;
    const lift = stack.anchorBottom - bottom;
    leaderLine.style.display = lift > speechBubbleGap ? "block" : "none";
    leaderLine.style.height = `${lift}px`;
  }
}

/** Re-lays out the world every animation frame while mounted. */
export function useWorldAnimation(world: WorldElements): void {
  useEffect(() => {
    let frameId = 0;
    const renderFrame = (nowMs: number) => {
      layOutWorld(world, nowMs);
      frameId = requestAnimationFrame(renderFrame);
    };
    frameId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(frameId);
  }, [world]);
}
