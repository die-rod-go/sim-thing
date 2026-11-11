import { simHoursBetween, type Memory } from "@village/shared";
import { config } from "../config";
import type { MemoryStore } from "./memory-store";

const HALVING_BASE = 0.5;

/** Strength after `hours` of fading with the given half-life. */
export function fadeStrength(strength: number, hours: number, halfLifeHours: number): number {
  return strength * HALVING_BASE ** (hours / halfLifeHours);
}

export interface ForgettingResult {
  kept: Memory[];
  deletedIds: string[];
}

export function groupByAgentAndBucket(memories: readonly Memory[]): Map<string, Memory[]> {
  const groups = new Map<string, Memory[]>();
  for (const memory of memories) {
    const key = `${memory.agentId}\u0000${memory.bucket}`;
    const group = groups.get(key) ?? [];
    group.push(memory);
    groups.set(key, group);
  }
  return groups;
}

function compareWeakestFirst(first: Memory, second: Memory): number {
  if (first.strength !== second.strength) return first.strength - second.strength;
  if (first.tick !== second.tick) return first.tick - second.tick;
  return first.id.localeCompare(second.id);
}

/**
 * Fades every memory by its bucket's half-life, deletes those below `deleteBelowStrength`, then
 * trims each agent's buckets to `bucketCap` by deleting the weakest.
 */
export function forgetMemories(
  memories: readonly Memory[],
  elapsedHours: number,
): ForgettingResult {
  const deletedIds: string[] = [];
  const faded: Memory[] = [];
  for (const memory of memories) {
    const halfLifeHours = config.memory.halfLifeHours[memory.bucket];
    const strength = fadeStrength(memory.strength, elapsedHours, halfLifeHours);
    if (strength < config.memory.deleteBelowStrength) deletedIds.push(memory.id);
    else faded.push({ ...memory, strength });
  }
  const kept: Memory[] = [];
  for (const group of groupByAgentAndBucket(faded).values()) {
    const weakestFirst = [...group].sort(compareWeakestFirst);
    const excess = Math.max(0, weakestFirst.length - config.memory.bucketCap);
    deletedIds.push(...weakestFirst.slice(0, excess).map((memory) => memory.id));
    kept.push(...weakestFirst.slice(excess));
  }
  return { kept, deletedIds };
}

/** Applies forgetting for `elapsedTicks` of sim time to the whole store; returns the deleted ids. */
export function applyForgetting(
  store: MemoryStore,
  elapsedTicks: number,
  minutesPerTick: number,
  frozenAgentIds: ReadonlySet<string> = new Set(),
): string[] {
  const elapsedHours = simHoursBetween(0, elapsedTicks, minutesPerTick);
  const fading = store.all().filter((memory) => !frozenAgentIds.has(memory.agentId));
  const { kept, deletedIds } = forgetMemories(fading, elapsedHours);
  for (const memoryId of deletedIds) store.remove(memoryId);
  for (const memory of kept) store.update(memory);
  return deletedIds;
}
