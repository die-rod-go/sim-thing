import type { ItemFile, Rule, Verb } from "@village/shared";

/** Whose steps are being edited: a verb has a user, an item and a target; a rule only a self. */
export type StepOwner = { kind: "verb"; verb: Verb } | { kind: "rule"; rule: Rule };

/**
 * One place a value or a thing name is entered. `stepIndex` is the step it belongs to, so only
 * `as` names given by earlier steps are offered; null is outside the steps (a verb's `reach`).
 */
export interface ValueSpot {
  file: ItemFile;
  owner: StepOwner;
  stepIndex: number | null;
}
