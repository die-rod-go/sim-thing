import {
  listComponentWords,
  resolveBodyComponents,
  type Agent,
  type ComponentInstance,
  type ThingCatalog,
} from "@village/shared";
import { config } from "../config";

/**
 * The tick a component added during `tick` runs out. A condition first runs on the next tick's
 * mechanics, so it lasts its whole `minutes`, rounded up to whole ticks.
 */
export function computeConditionEndTick(
  minutes: number | null,
  tick: number,
  minutesPerTick: number,
): number | null {
  if (minutes === null) return null;
  return tick + 1 + Math.ceil(minutes / minutesPerTick);
}

export function hasComponentEnded(instance: ComponentInstance | null, tick: number): boolean {
  return instance !== null && instance.endsAtTick !== null && tick >= instance.endsAtTick;
}

/**
 * How the agent's body reads ("bleeding", "on fire"): every component's words to the agent
 * itself, only the visible ones when others look.
 */
export function listBodyWords(items: ThingCatalog, agent: Agent, isVisibleOnly: boolean): string[] {
  return listComponentWords(items.declarations, resolveBodyComponents(items, agent), isVisibleOnly);
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
