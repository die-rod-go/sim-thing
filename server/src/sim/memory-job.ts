import type { TickResult, WorldState } from "./world-state";

/** What one finished job does to the world; false when its call failed and it changed nothing. */
export type ApplyJob = (state: WorldState, result: TickResult) => boolean;

/** A memory job (summary, pass or plan) that has come back, ready to apply. */
export interface JobOutcome {
  agentId: string;
  /** For the log: "episode", "people pass", "day plan". */
  jobName: string;
  apply: ApplyJob;
}
