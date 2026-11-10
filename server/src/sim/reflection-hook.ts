import type { TickResult, WorldState } from "./world-state";

/**
 * Where reflection plugs into the tick. The sleep callbacks are synchronous and only record what
 * happened; `afterTick` runs last in every tick and may make async LLM calls (the clock waits for
 * it). It may change agents, memories and its own `state.reflectionState`, and should report
 * agents it changed in `result.changedAgentIds`.
 */
export interface ReflectionHook {
  onSleepStarted(state: WorldState, agentId: string, tick: number): void;
  onWoke(state: WorldState, agentId: string, tick: number, sleptTicks: number): void;
  afterTick(state: WorldState, result: TickResult): Promise<void>;
}

export function createNoReflectionHook(): ReflectionHook {
  return {
    onSleepStarted: () => undefined,
    onWoke: () => undefined,
    afterTick: () => Promise.resolve(),
  };
}
