import { NEED_NAMES, STAT_NAMES, TRAIT_NAMES } from "@village/shared";
import type { AgentBody, NeedName, Needs, Personality, TraitName } from "@village/shared";
import { config } from "../config";
import type { NeedWord } from "../config";
import { findHealthWord } from "../status/health";

/** What the agent feels of its own body and needs. */
export interface StatusView {
  health: number;
  needs: Needs;
  /** Going without food has begun to cost health. */
  isStarvationHarming?: boolean;
}

const NO_CONDITIONS: readonly string[] = [];

/** A condition reads like a satisfied need: listed among the rest, never pressing by itself. */
function describeCondition(text: string): NeedWord {
  return { below: Infinity, text };
}

export function findNeedWord(needName: NeedName, value: number): NeedWord {
  const levels = config.needs.words[needName];
  const level = levels.find((candidate) => value < candidate.below) ?? levels[levels.length - 1];
  return level ?? { below: Infinity, text: needName };
}

export function joinWithAnd(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/** The status in two parts: a sentence for each pressing need, lowest first, and the rest. */
export interface StatusParts {
  pressingSentences: string[];
  /** The words for everything not pressing; empty when all of it is. */
  otherWords: string[];
}

/** Health, conditions and needs as words, never numbers, split into pressing and the rest. */
export function splitStatus(
  status: StatusView,
  conditionWords: readonly string[] = NO_CONDITIONS,
): StatusParts {
  const { needs } = status;
  const needWords = [
    { value: status.health, word: findHealthWord(status.health) },
    ...conditionWords.map((text) => ({ value: status.health, word: describeCondition(text) })),
    ...NEED_NAMES.map((needName) => ({
      value: needs[needName],
      word: findNeedWord(needName, needs[needName]),
    })),
  ];
  const hungerWord = findNeedWord("hunger", needs.hunger);
  const isHarming = status.isStarvationHarming === true;
  const describeUrge = (word: NeedWord) =>
    word === hungerWord && isHarming ? config.health.starvationHarmUrge : word.urge;
  const pressingSentences = needWords
    .filter((needWord) => needWord.word.urge !== undefined)
    .sort((first, second) => first.value - second.value)
    .map((needWord) => `You are ${needWord.word.text}: ${describeUrge(needWord.word) ?? ""}.`);
  const otherWords = needWords
    .filter((needWord) => needWord.word.urge === undefined)
    .map((needWord) => needWord.word.text);
  return { pressingSentences, otherWords };
}

/**
 * The status as one passage, pressing needs first so they can't get lost among the satisfied
 * ones: "You are exhausted: you can barely keep your eyes open ... Otherwise you are in poor
 * shape, well fed, socially fulfilled and a bit bored."
 */
export function describeStatus(
  status: StatusView,
  conditionWords: readonly string[] = NO_CONDITIONS,
): string {
  const { pressingSentences, otherWords } = splitStatus(status, conditionWords);
  if (pressingSentences.length === 0) return `You are ${joinWithAnd(otherWords)}.`;
  if (otherWords.length === 0) return pressingSentences.join(" ");
  return `${pressingSentences.join(" ")} Otherwise you are ${joinWithAnd(otherWords)}.`;
}

function pickBandWord(
  words: readonly string[],
  wordBands: readonly number[],
  value: number,
  fallback: string,
): string {
  const bandIndex = wordBands.findIndex((upperBound) => value < upperBound);
  return words[bandIndex === -1 ? words.length - 1 : bandIndex] ?? fallback;
}

/** "quite introverted": one trait as the word for its band. */
export function describeTraitWord(traitName: TraitName, value: number): string {
  return pickBandWord(config.traits.words[traitName], config.traits.wordBands, value, traitName);
}

/** "quite introverted, very agreeable, ...": each trait as the word for its band. */
export function describeTraits(traits: Personality["traits"]): string {
  return TRAIT_NAMES.map((traitName) => describeTraitWord(traitName, traits[traitName])).join(", ");
}

/** "quite strong, rather clumsy": the agent's own stats as words. Others never see these. */
export function describeStats(body: AgentBody): string {
  return STAT_NAMES.map((statName) =>
    pickBandWord(config.stats.words[statName], config.stats.wordBands, body[statName], statName),
  ).join(", ");
}
