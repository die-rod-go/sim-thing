import type { CurrentAction } from "@village/shared";

export type ActivityCue = { kind: "sleep" } | { kind: "glyph"; glyph: string } | null;

export interface ActivityGlyphs {
  sleepVerb: string;
  verbGlyphs: Readonly<Record<string, string>>;
  actionGlyphs: Readonly<Record<string, string>>;
}

/** What to show over an agent's head for its current action, if anything. */
export function pickActivityCue(action: CurrentAction | null, glyphs: ActivityGlyphs): ActivityCue {
  if (action === null) return null;
  if (action.kind === "sleep" || action.verb === glyphs.sleepVerb) {
    return { kind: "sleep" };
  }
  const verbGlyph = action.verb === undefined ? undefined : glyphs.verbGlyphs[action.verb];
  const glyph = verbGlyph ?? glyphs.actionGlyphs[action.kind];
  return glyph === undefined ? null : { kind: "glyph", glyph };
}
