import type { HarmCause } from "./damage";

/** Who is behind a write or a rule, how a death from it reads, and how deep in a chain it is. */
export interface RuleCause extends HarmCause {
  /** How many rules deep: 0 for a verb, a tick's own mechanics or a bare write. */
  depth: number;
}

export const NO_RULE_CAUSE: RuleCause = { killed: "", sourceAgentId: null, depth: 0 };
