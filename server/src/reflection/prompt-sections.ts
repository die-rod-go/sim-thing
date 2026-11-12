import { formatSimTime, TRAIT_NAMES } from "@village/shared";
import type { Goal, Memory, Personality, TraitName } from "@village/shared";
import { config } from "../config";
import type { DossierEntry } from "../memory/dossiers";
import { describeReflectionKind } from "./reflection-memories";

const TRAIT_VALUE_DECIMALS_SHOWN = 2;
const LINE_BREAK = "\n";

function bulletList(lines: readonly string[], emptyText: string): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : emptyText;
}

function describeTick(tick: number): string {
  return formatSimTime(tick, config.clock);
}

/** "- Day 3, 08:15 (did): I baked bread" */
export function describeTimedMemories(memories: readonly Memory[], emptyText: string): string {
  return bulletList(
    memories.map((memory) => `${describeTick(memory.tick)} (${memory.bucket}): ${memory.text}`),
    emptyText,
  );
}

/** "- Day 3, 02:00, Summary: ..." */
export function describeReflections(memories: readonly Memory[], emptyText: string): string {
  return bulletList(
    memories.map(
      (memory) => `${describeTick(memory.tick)}, ${describeReflectionKind(memory)}: ${memory.text}`,
    ),
    emptyText,
  );
}

/** "- Bob: <dossier text>" for each person, in the order given. */
export function describeDossiers(entries: readonly DossierEntry[], emptyText: string): string {
  return bulletList(
    entries.map((entry) => `${entry.person}: ${entry.text}`),
    emptyText,
  );
}

/** "1. text (why: ...; so far: ...)": goals numbered as the daytime reply refers to them. */
export function describeNumberedGoals(goals: readonly Goal[]): string {
  if (goals.length === 0) return "No goals right now.";
  return goals
    .map((goal, index) => `${index + 1}. ${goal.text} (why: ${goal.why}; so far: ${goal.progress})`)
    .join(LINE_BREAK);
}

/** Goals with their kind, as the night pass must return them. */
export function describeGoalsWithKind(goals: readonly Goal[]): string {
  return bulletList(
    goals.map((goal) => `[${goal.kind}] ${goal.text} (why: ${goal.why}; so far: ${goal.progress})`),
    "No goals right now.",
  );
}

function describeTraitWord(traitName: TraitName, value: number): string {
  const words = config.traits.words[traitName];
  const bandIndex = config.traits.wordBands.findIndex((upperBound) => value < upperBound);
  return words[bandIndex === -1 ? words.length - 1 : bandIndex] ?? traitName;
}

/** "- extraversion: -0.30 (quite introverted)" for each trait. */
export function describeTraitValues(traits: Personality["traits"]): string {
  return bulletList(
    TRAIT_NAMES.map(
      (traitName) =>
        `${traitName}: ${traits[traitName].toFixed(TRAIT_VALUE_DECIMALS_SHOWN)} ` +
        `(${describeTraitWord(traitName, traits[traitName])})`,
    ),
    "",
  );
}
