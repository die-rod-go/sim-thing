import { NEED_NAMES, STAT_NAMES, TRAIT_NAMES } from "@village/shared";
import type { AgentBody, NeedName, Needs, Personality } from "@village/shared";
import { config } from "../config";
import type { NeedWord } from "../config";
import { findHealthWord } from "../status/health";

/** What the agent feels of its own body and needs. */
export interface StatusView {
  health: number;
  needs: Needs;
}

function findNeedWord(needName: NeedName, value: number): NeedWord {
  const levels = config.needs.words[needName];
  const level = levels.find((candidate) => value < candidate.below) ?? levels[levels.length - 1];
  return level ?? { below: Infinity, text: needName };
}

function joinWithAnd(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/**
 * Health and needs as words, never numbers. Pressing ones come first, lowest first, each as its
 * own sentence, so they can't get lost among the satisfied ones:
 * "You are exhausted: you can barely keep your eyes open and need to sleep now. Otherwise you
 * are unhurt, well fed, socially fulfilled and a bit bored."
 */
export function describeStatus(status: StatusView): string {
  const { needs } = status;
  const needWords = [
    { value: status.health, word: findHealthWord(status.health) },
    ...NEED_NAMES.map((needName) => ({
      value: needs[needName],
      word: findNeedWord(needName, needs[needName]),
    })),
  ];
  const pressingSentences = needWords
    .filter((needWord) => needWord.word.urge !== undefined)
    .sort((first, second) => first.value - second.value)
    .map((needWord) => `You are ${needWord.word.text}: ${needWord.word.urge ?? ""}.`);
  const otherWords = needWords
    .filter((needWord) => needWord.word.urge === undefined)
    .map((needWord) => needWord.word.text);
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

/** "quite introverted, very agreeable, ...": each trait as the word for its band. */
export function describeTraits(traits: Personality["traits"]): string {
  return TRAIT_NAMES.map((traitName) =>
    pickBandWord(
      config.traits.words[traitName],
      config.traits.wordBands,
      traits[traitName],
      traitName,
    ),
  ).join(", ");
}

/** "quite strong, rather clumsy": the agent's own stats as words. Others never see these. */
export function describeStats(body: AgentBody): string {
  return STAT_NAMES.map((statName) =>
    pickBandWord(config.stats.words[statName], config.stats.wordBands, body[statName], statName),
  ).join(", ");
}
