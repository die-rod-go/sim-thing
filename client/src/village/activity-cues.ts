import type { CurrentAction } from "@village/shared";
import { isThreadOngoing, type ConversationThread } from "../format/conversations";

export type ActivityCue = { kind: "sleep" } | { kind: "glyph"; glyph: string } | null;

export interface ActivityGlyphs {
  sleepInteraction: string;
  interactionGlyphs: Readonly<Record<string, string>>;
  actionGlyphs: Readonly<Record<string, string>>;
}

/** What to show over an agent's head for its current action, if anything. */
export function pickActivityCue(action: CurrentAction | null, glyphs: ActivityGlyphs): ActivityCue {
  if (action === null) return null;
  if (action.kind === "sleep" || action.interaction === glyphs.sleepInteraction) {
    return { kind: "sleep" };
  }
  const interactionGlyph =
    action.interaction === undefined ? undefined : glyphs.interactionGlyphs[action.interaction];
  const glyph = interactionGlyph ?? glyphs.actionGlyphs[action.kind];
  return glyph === undefined ? null : { kind: "glyph", glyph };
}

/** A line drawn between two agents talking in the same ongoing conversation. */
export interface ConversationLink {
  key: string;
  fromAgentId: string;
  toAgentId: string;
}

/** Links between every pair of speakers in each ongoing conversation, without duplicates. */
export function listConversationLinks(
  threads: readonly ConversationThread[],
  currentTick: number,
  maxGapTicks: number,
): ConversationLink[] {
  const linksByKey = new Map<string, ConversationLink>();
  for (const thread of threads) {
    if (!isThreadOngoing(thread, currentTick, maxGapTicks)) continue;
    const speakers = [...thread.speakerIds].sort();
    speakers.forEach((fromAgentId, speakerIndex) => {
      for (const toAgentId of speakers.slice(speakerIndex + 1)) {
        const key = `${fromAgentId}|${toAgentId}`;
        linksByKey.set(key, { key, fromAgentId, toAgentId });
      }
    });
  }
  return [...linksByKey.values()];
}
