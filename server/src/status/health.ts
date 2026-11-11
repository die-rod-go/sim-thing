import type { Agent } from "@village/shared";
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

export function clampHealth(health: number): number {
  return Math.min(1, Math.max(0, health));
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

/** Slow natural healing, faster asleep, and only while the agent isn't too hungry. */
export function regenerateHealth(agent: Agent, options: RegenerationOptions): Agent {
  if (agent.needs.hunger <= config.health.regenHungerThreshold || agent.health >= 1) return agent;
  const perHour = options.isAsleep
    ? config.health.regenPerHourAsleep
    : config.health.regenPerHourAwake;
  const gained = (perHour * options.minutesPerTick) / MINUTES_PER_HOUR;
  return { ...agent, health: clampHealth(agent.health + gained) };
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
