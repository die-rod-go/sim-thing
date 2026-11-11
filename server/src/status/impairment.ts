import { NEED_NAMES } from "@village/shared";
import { findNeedWord, joinWithAnd, type StatusView } from "../decision/words";
import { findHealthWord } from "./health";

/** How much the agent's pressing needs and wounds get in the way, and the words for them. */
export interface Impairment {
  /** "exhausted and very hungry": what is getting in the way, as the agent feels it. */
  statusWords: string;
  amount: number;
}

interface StatusLevel {
  text: string;
  slowdown?: number;
  recallFailureChance?: number;
}

function listStatusLevels(status: StatusView): StatusLevel[] {
  return [
    findHealthWord(status.health),
    ...NEED_NAMES.map((needName) => findNeedWord(needName, status.needs[needName])),
  ];
}

function describeLevels(levels: readonly StatusLevel[]): string {
  return joinWithAnd(levels.map((level) => level.text));
}

/**
 * How much longer verbs take: each level's slowdown adds up, so an exhausted, starving agent is
 * slower than one that is only exhausted. Null when nothing slows the agent down.
 */
export function findSlowdown(status: StatusView): Impairment | null {
  const slowingLevels = listStatusLevels(status).filter((level) => (level.slowdown ?? 0) > 0);
  if (slowingLevels.length === 0) return null;
  return {
    statusWords: describeLevels(slowingLevels),
    amount: slowingLevels.reduce((total, level) => total + (level.slowdown ?? 0), 0),
  };
}

/** The chance recall fails: each level is its own independent chance to lose the thought. */
export function findRecallFog(status: StatusView): Impairment | null {
  const foggingLevels = listStatusLevels(status).filter(
    (level) => (level.recallFailureChance ?? 0) > 0,
  );
  if (foggingLevels.length === 0) return null;
  const clearChance = foggingLevels.reduce(
    (chance, level) => chance * (1 - (level.recallFailureChance ?? 0)),
    1,
  );
  return { statusWords: describeLevels(foggingLevels), amount: 1 - clearChance };
}

/** The recall fog that wins a roll in [0, 1), or null when the agent thinks clearly. */
export function findFailedRecall(status: StatusView, roll: number): Impairment | null {
  const fog = findRecallFog(status);
  return fog !== null && roll < fog.amount ? fog : null;
}

export function fillStatusWords(phrase: string, statusWords: string): string {
  return phrase.split("{status}").join(statusWords);
}
