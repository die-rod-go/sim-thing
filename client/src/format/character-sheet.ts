import {
  formatSimTime,
  toSimTime,
  type AgentCondition,
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

/** "Died day 3, 14:20: stabbed by Tobias" */
export function describeDeath(death: AgentDeath, timeSettings: SimTimeSettings): string {
  const time = toSimTime(death.tick, timeSettings);
  const clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  return `Died day ${time.day}, ${clock}: ${death.cause}`;
}

/** "bleeding 12m", or just "burning" for a condition with no set end. */
export function describeCondition(
  condition: AgentCondition,
  currentTick: number,
  timeSettings: SimTimeSettings,
): string {
  if (condition.endsAtTick === null) return condition.name;
  const minutesLeft = Math.max(0, condition.endsAtTick - currentTick) * timeSettings.minutesPerTick;
  return `${condition.name} ${minutesLeft}m`;
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
      const doing = action.interaction ?? "using";
      return target ? `${doing} at ${target}${until}` : `${doing}${until}`;
    }
    default:
      return target ? `${action.kind} → ${target}${until}` : `${action.kind}${until}`;
  }
}

/** "08:05", without the day; for timestamps inside a list already grouped by day. */
export function formatClockTime(tick: number, timeSettings: SimTimeSettings): string {
  const full = formatSimTime(tick, timeSettings);
  return full.slice(full.indexOf(", ") + 2);
}

export function formatCarrying(coins: number, inventory: Record<string, number>): string[] {
  const items = Object.entries(inventory)
    .filter(([, count]) => count > 0)
    .map(([item, count]) => `${count} ${item}`);
  return [`${coins} coins`, ...items];
}
