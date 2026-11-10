import { config } from "../config";
import { applyForgetting, forgetMemories } from "../memory/forgetting";
import type { WorldState } from "./world-state";

/** Trims each agent's buckets to `bucketCap` (weakest first) without fading anything. */
export function enforceBucketCaps(state: WorldState): void {
  for (const agent of state.agents) {
    const { deletedIds } = forgetMemories(state.memoryStore.listByAgent(agent.id), 0);
    for (const memoryId of deletedIds) state.memoryStore.remove(memoryId);
  }
}

/** Fades memories for the time since the last pass, every `forgettingEveryTicks`. */
export function runScheduledForgetting(state: WorldState): void {
  const elapsedTicks = state.tick - state.lastForgettingTick;
  if (elapsedTicks < config.memory.forgettingEveryTicks) return;
  applyForgetting(state.memoryStore, elapsedTicks, config.clock.minutesPerTick);
  state.lastForgettingTick = state.tick;
}
