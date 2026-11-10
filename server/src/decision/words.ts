import { NEED_NAMES, TRAIT_NAMES } from "@village/shared";
import type { Needs, Personality } from "@village/shared";
import { config } from "../config";

/** "quite hungry, rested, a bit lonely, fairly entertained": needs as words, never numbers. */
export function describeNeeds(needs: Needs): string {
  return NEED_NAMES.map((needName) => {
    const levels = config.needs.words[needName];
    const level = levels.find((candidate) => needs[needName] < candidate.below);
    return level?.text ?? levels[levels.length - 1]?.text ?? needName;
  }).join(", ");
}

/** "quite introverted, very agreeable, ...": each trait as the word for its band. */
export function describeTraits(traits: Personality["traits"]): string {
  return TRAIT_NAMES.map((traitName) => {
    const words = config.traits.words[traitName];
    const bandIndex = config.traits.wordBands.findIndex(
      (upperBound) => traits[traitName] < upperBound,
    );
    const index = bandIndex === -1 ? words.length - 1 : bandIndex;
    return words[index] ?? traitName;
  }).join(", ");
}
