import { formatSimTime, TRAIT_NAMES } from "@village/shared";
import type { Goal, Memory, Personality, TraitName } from "@village/shared";
import { config } from "../config";
import { describeReflectionKind } from "./reflection-memories";

const TRAIT_VALUE_DECIMALS_SHOWN = 2;

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

export function describePeopleNotes(notesByPerson: ReadonlyMap<string, Memory[]>): string {
  const lines = [...notesByPerson.entries()].map(([person, notes]) => {
    const noteText = notes.length > 0 ? notes.map((note) => note.text).join(" ") : "no notes yet";
    return `${person}: ${noteText}`;
  });
  return bulletList(lines, "You did not deal with anyone in particular today.");
}

/** Goals with their kind, as the weekly pass must return them. */
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
