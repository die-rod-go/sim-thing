import {
  findDefinition,
  parseComponentPath,
  writeFieldChange,
  type Agent,
  type ThingCatalog,
} from "@village/shared";
import { config } from "../config";
import type { HealthWord } from "../config";

const MINUTES_PER_HOUR = 60;

export function isDead(agent: Pick<Agent, "death">): boolean {
  return agent.death !== null;
}

/** "Mara's body": how others see and name a dead agent. */
export function describeBodyName(name: string): string {
  return config.death.bodyName.split("{name}").join(name);
}

/**
 * The agent with its health field set (clamped to the field's bounds). A pure write: waking,
 * thresholds and death are `writeField`'s and `applyDamage`'s business.
 */
export function withAgentHealth(items: ThingCatalog, agent: Agent, health: number): Agent {
  const path = parseComponentPath(items.world.agentHealth);
  if (path === null) throw new Error(`Bad agent health path "${items.world.agentHealth}"`);
  const body = findDefinition(items, items.world.agentBody);
  const bodyChanges = writeFieldChange(items.declarations, body, agent.bodyChanges, path, health);
  return bodyChanges === agent.bodyChanges ? agent : { ...agent, bodyChanges };
}

/** Starts the starvation clock when hunger reaches 0 and stops it as soon as hunger rises. */
export function trackStarvation(agent: Agent, tick: number): Agent {
  const isStarving = agent.needs.hunger <= 0;
  if (isStarving && agent.starvingSinceTick === null) return { ...agent, starvingSinceTick: tick };
  if (!isStarving && agent.starvingSinceTick !== null) return { ...agent, starvingSinceTick: null };
  return agent;
}

/** Health lost to starvation this tick: nothing until the grace period has passed. */
export function computeStarvationDamage(
  agent: Agent,
  tick: number,
  minutesPerTick: number,
): number {
  if (agent.starvingSinceTick === null) return 0;
  const starvingMinutes = (tick - agent.starvingSinceTick) * minutesPerTick;
  if (starvingMinutes < config.health.starvationGraceHours * MINUTES_PER_HOUR) return 0;
  return (config.health.starvationDrainPerHour * minutesPerTick) / MINUTES_PER_HOUR;
}

export interface RegenerationOptions {
  isAsleep: boolean;
  minutesPerTick: number;
}

/**
 * Health gained this tick by slow natural healing, faster asleep, and only while the agent isn't
 * too hungry. The health field's own `max` caps it when it is written.
 */
export function computeRegeneration(agent: Agent, options: RegenerationOptions): number {
  if (agent.needs.hunger <= config.health.regenHungerThreshold) return 0;
  const perHour = options.isAsleep
    ? config.health.regenPerHourAsleep
    : config.health.regenPerHourAwake;
  return (perHour * options.minutesPerTick) / MINUTES_PER_HOUR;
}

/** The decision thresholds health dropped below, going from `before` to `after`. */
export function findCrossedHealthThresholds(before: number, after: number): number[] {
  return config.health.decisionThresholds.filter(
    (threshold) => before >= threshold && after < threshold,
  );
}

export function findHealthWord(health: number): HealthWord {
  const levels = config.health.words;
  const level = levels.find((candidate) => health < candidate.below) ?? levels[levels.length - 1];
  return level ?? { below: Infinity, text: "unhurt", looks: "looks unhurt" };
}

/** How the agent's health looks to others in sight, or null while it doesn't show. */
export function describeHealthAsSeen(health: number): string | null {
  if (health >= config.health.visibleToOthersBelow) return null;
  return findHealthWord(health).looks;
}
