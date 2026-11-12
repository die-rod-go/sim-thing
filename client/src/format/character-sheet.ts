import {
  formatTimeOfDay,
  toSimTime,
  type AgentDeath,
  type CurrentAction,
  type NeedName,
  type SimTimeSettings,
  type TraitName,
} from "@village/shared";
import { clientConfig } from "../client-config";

export interface NeedLevel {
  word: string;
  /** 0 is the worst level; the highest index is fully satisfied. */
  levelIndex: number;
  isAlert: boolean;
}

export function describeHealth(value: number): NeedLevel {
  const { upperBounds, words, alertLevelIndex } = clientConfig.healthLevels;
  const foundIndex = upperBounds.findIndex((upperBound) => value < upperBound);
  const levelIndex = foundIndex === -1 ? upperBounds.length : foundIndex;
  return {
    word: words[levelIndex] ?? "health",
    levelIndex,
    isAlert: levelIndex <= alertLevelIndex,
  };
}

/** "Died day 3, 2:20 pm: stabbed by Tobias" */
export function describeDeath(death: AgentDeath, timeSettings: SimTimeSettings): string {
  const time = toSimTime(death.tick, timeSettings);
  return `Died day ${time.day}, ${formatTimeOfDay(time)}: ${death.cause}`;
}

export function describeNeed(needName: NeedName, value: number): NeedLevel {
  const { upperBounds, words, alertLevelIndex } = clientConfig.needLevels;
  const foundIndex = upperBounds.findIndex((upperBound) => value < upperBound);
  const levelIndex = foundIndex === -1 ? upperBounds.length : foundIndex;
  const needWords = words[needName];
  return {
    word: needWords[levelIndex] ?? needName,
    levelIndex,
    isAlert: levelIndex <= alertLevelIndex,
  };
}

export type TraitIntensity = "balanced" | "slight" | "strong" | "extreme";

export interface TraitDescription {
  phrase: string;
  intensity: TraitIntensity;
}

const INTENSITY_ADVERBS: Record<Exclude<TraitIntensity, "balanced">, string> = {
  slight: "a little",
  strong: "quite",
  extreme: "very",
};

export function describeTrait(traitName: TraitName, value: number): TraitDescription {
  const { balancedBelow, strongFrom, extremeFrom, poles } = clientConfig.traitWords;
  const [lowWord, highWord] = poles[traitName];
  const distance = Math.abs(value);
  if (distance < balancedBelow) {
    return { phrase: `neither ${lowWord} nor ${highWord}`, intensity: "balanced" };
  }
  const intensity: TraitIntensity =
    distance >= extremeFrom ? "extreme" : distance >= strongFrom ? "strong" : "slight";
  const word = value < 0 ? lowWord : highWord;
  return { phrase: `${INTENSITY_ADVERBS[intensity]} ${word}`, intensity };
}

/** A present-tense phrase for what the agent is doing, e.g. "walking to the bakery". */
export function describeActivity(
  action: CurrentAction | null,
  timeSettings: SimTimeSettings,
): string {
  if (action === null) return "idle";
  const until =
    action.endsAtTick === null ? "" : ` until ${formatClockTime(action.endsAtTick, timeSettings)}`;
  const target = action.target ?? "";
  switch (action.kind) {
    case "walk_to":
      return `walking to ${target || "somewhere"}`;
    case "sleep":
      return target ? `asleep in ${target}${until}` : `asleep${until}`;
    case "wait":
      return `waiting${until}`;
    case "interact": {
      const doing = action.verb ?? "using";
      return target ? `${doing} at ${target}${until}` : `${doing}${until}`;
    }
    default:
      return target ? `${action.kind} → ${target}${until}` : `${action.kind}${until}`;
  }
}

/** "8:05 am", without the day; for timestamps inside a list already grouped by day. */
export function formatClockTime(tick: number, timeSettings: SimTimeSettings): string {
  return formatTimeOfDay(toSimTime(tick, timeSettings));
}
