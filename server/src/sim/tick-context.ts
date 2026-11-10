import type { StructuredCaller } from "../llm/call-structured";
import type { ReflectionHook } from "./reflection-hook";
import type { TickResult, WorldState } from "./world-state";

/** What the decision strategy needs from outside the world. */
export interface SimDependencies {
  callStructured: StructuredCaller;
  reflectionHook: ReflectionHook;
  /** Overrides `config.server.promptsDirectory`, e.g. in tests. */
  promptsDirectory?: string;
}

/** One tick in progress: the world, what the tick has produced so far, and the dependencies. */
export interface TickContext {
  state: WorldState;
  result: TickResult;
  dependencies: SimDependencies;
}
