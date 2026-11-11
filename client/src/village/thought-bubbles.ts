import type { Agent } from "@village/shared";

/** Whose thoughts float over the map: only the inspected agent's, everyone's, or nobody's. */
export type ThoughtMode = "selected" | "everyone" | "off";

export const THOUGHT_MODES: readonly ThoughtMode[] = ["selected", "everyone", "off"];

export const THOUGHT_MODE_LABELS: Record<ThoughtMode, string> = {
  selected: "Thoughts: selected",
  everyone: "Thoughts: everyone",
  off: "Thoughts: off",
};

export interface VisibleThought {
  shortText: string;
  fullText: string;
}

export interface ThoughtVisibility {
  mode: ThoughtMode;
  inspectedAgentId: string | null;
  currentTick: number;
  maxAgeTicks: number;
  maxLength: number;
}

const ELLIPSIS = "…";

export function parseThoughtMode(raw: string | null): ThoughtMode | null {
  return THOUGHT_MODES.find((mode) => mode === raw) ?? null;
}

export function nextThoughtMode(mode: ThoughtMode): ThoughtMode {
  const nextIndex = (THOUGHT_MODES.indexOf(mode) + 1) % THOUGHT_MODES.length;
  return THOUGHT_MODES[nextIndex] ?? "selected";
}

/** Cuts a thought at a word boundary near `maxLength`, marking the cut with an ellipsis. */
export function truncateThought(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength - ELLIPSIS.length);
  const lastSpace = cut.lastIndexOf(" ");
  const wordCut = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${wordCut.trimEnd()}${ELLIPSIS}`;
}

function isShown(agent: Agent, visibility: ThoughtVisibility): boolean {
  if (visibility.mode === "off") return false;
  if (visibility.mode === "selected") return agent.id === visibility.inspectedAgentId;
  return true;
}

/** The thoughts to draw this render, by agent: fresh ones only, for the agents the mode allows. */
export function selectVisibleThoughts(
  agents: readonly Agent[],
  visibility: ThoughtVisibility,
): Map<string, VisibleThought> {
  const thoughtsByAgent = new Map<string, VisibleThought>();
  for (const agent of agents) {
    const thought = agent.lastThought;
    if (!thought || !isShown(agent, visibility)) continue;
    if (visibility.currentTick - thought.tick > visibility.maxAgeTicks) continue;
    thoughtsByAgent.set(agent.id, {
      shortText: truncateThought(thought.text, visibility.maxLength),
      fullText: thought.text,
    });
  }
  return thoughtsByAgent;
}
