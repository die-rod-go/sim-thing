import type { StructuredCaller } from "../llm/call-structured";
import type { TickResult, WorldState } from "./world-state";

/** What the decision strategy needs from outside the world. */
export interface SimDependencies {
  callStructured: StructuredCaller;
  /** Overrides `config.server.promptsDirectory`, e.g. in tests. */
  promptsDirectory?: string;
  /** Keeps the decision reply's JSON schema identical across calls, so prompt caching can match. */
  isReplySchemaStable?: boolean;
  /**
   * Lets the clock run on while decisions and summaries wait for the LLM, applying each on the
   * first tick after it returns. Off (each tick waits for all of them) keeps runs reproducible, e.g. in tests.
   */
  shouldCallLlmInBackground?: boolean;
  /** With `shouldCallLlmInBackground`, caps how long idle agents' decisions hold a tick; no cap when omitted. */
  idleDecisionWaitMs?: number;
}

/** One tick in progress: the world, what the tick has produced so far, and the dependencies. */
export interface TickContext {
  state: WorldState;
  result: TickResult;
  dependencies: SimDependencies;
}
