import type { ActiveCondition, ItemCatalog } from "@village/shared";
import { config } from "../config";

export interface ConditionAddition {
  conditions: ActiveCondition[];
  /** False when the condition was already there and was only extended. */
  isNew: boolean;
}

function isLaterEnd(candidate: number | null, current: number | null): boolean {
  if (current === null) return false;
  return candidate === null || candidate > current;
}

/**
 * Adds a condition. One that is already there is extended to the later end rather than stacked,
 * and remembers the newest cause.
 */
export function addToConditions(
  conditions: readonly ActiveCondition[],
  added: ActiveCondition,
): ConditionAddition {
  const existing = conditions.find((condition) => condition.name === added.name);
  if (!existing) return { conditions: [...conditions, added], isNew: true };
  const extended: ActiveCondition = {
    name: added.name,
    endsAtTick: isLaterEnd(added.endsAtTick, existing.endsAtTick)
      ? added.endsAtTick
      : existing.endsAtTick,
    sourceAgentId: added.sourceAgentId ?? existing.sourceAgentId,
  };
  return {
    conditions: conditions.map((condition) => (condition === existing ? extended : condition)),
    isNew: false,
  };
}

export function removeFromConditions(
  conditions: readonly ActiveCondition[],
  name: string,
): ActiveCondition[] {
  return conditions.filter((condition) => condition.name !== name);
}

/**
 * The tick a condition added during `tick` runs out. It first runs on the next tick's mechanics,
 * so it lasts its whole `minutes`, rounded up to whole ticks.
 */
export function computeConditionEndTick(
  minutes: number | null,
  tick: number,
  minutesPerTick: number,
): number | null {
  if (minutes === null) return null;
  return tick + 1 + Math.ceil(minutes / minutesPerTick);
}

export function hasConditionEnded(condition: ActiveCondition, tick: number): boolean {
  return condition.endsAtTick !== null && tick >= condition.endsAtTick;
}

/** Each condition's words ("bleeding", "on fire"); only the visible ones when others look. */
export function listConditionWords(
  items: ItemCatalog,
  conditions: readonly ActiveCondition[],
  isVisibleOnly: boolean,
): string[] {
  return conditions.flatMap((condition) => {
    const definition = items.conditionsByName.get(condition.name);
    if (!definition || (isVisibleOnly && !definition.isVisible)) return [];
    return [definition.words];
  });
}

const ACTOR_PLACEHOLDER = "{actor}";

/**
 * "bled to death", with "after being hurt by {actor}" when an agent caused it and the phrase
 * doesn't name them itself.
 */
export function describeConditionKilling(killed: string, sourceAgentId: string | null): string {
  if (sourceAgentId === null || killed.includes(ACTOR_PLACEHOLDER)) return killed;
  return `${killed}${config.conditions.causedBySuffix}`;
}
