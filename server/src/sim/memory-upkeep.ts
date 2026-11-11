import type { Memory } from "@village/shared";
import { config } from "../config";
import { applyForgetting, forgetMemories, groupByAgentAndBucket } from "../memory/forgetting";
import { isDead } from "../status/health";
import type { WorldState } from "./world-state";

function needsTrimming(bucketGroup: readonly Memory[]): boolean {
  return (
    bucketGroup.length > config.memory.bucketCap ||
    bucketGroup.some((memory) => memory.strength < config.memory.deleteBelowStrength)
  );
}

/**
 * Trims each agent's buckets to `bucketCap` (weakest first) without fading anything. Runs every
 * tick, so it only sorts the buckets that actually need trimming.
 */
export function enforceBucketCaps(state: WorldState): void {
  for (const bucketGroup of groupByAgentAndBucket(state.memoryStore.all()).values()) {
    if (!needsTrimming(bucketGroup)) continue;
    const { deletedIds } = forgetMemories(bucketGroup, 0);
    for (const memoryId of deletedIds) state.memoryStore.remove(memoryId);
  }
}

/**
 * Fades memories for the time since the last pass, every `forgettingEveryTicks`. The dead's
 * memories stay as they were, readable in the viewer.
 */
export function runScheduledForgetting(state: WorldState): void {
  const elapsedTicks = state.tick - state.lastForgettingTick;
  if (elapsedTicks < config.memory.forgettingEveryTicks) return;
  const deadAgentIds = new Set(state.agents.filter(isDead).map((agent) => agent.id));
  applyForgetting(state.memoryStore, elapsedTicks, config.clock.minutesPerTick, deadAgentIds);
  state.lastForgettingTick = state.tick;
}
