import type { DecisionPlan } from "./decision-runner";
import type { WorldState } from "./world-state";

type DecisionOutcome =
  | { kind: "pending" }
  | { kind: "planned"; plan: DecisionPlan }
  | { kind: "failed"; error: unknown };

interface InFlightDecision {
  /** The world the decision was asked in; replies for a replaced world (e.g. after a reset) are dropped. */
  state: WorldState;
  outcome: DecisionOutcome;
  /** Settles (never rejects) once the outcome is no longer pending. */
  settled: Promise<void>;
}

/**
 * Decisions that may run while the clock keeps going: each one starts on the tick it is requested
 * and its plan is collected on the first tick after the reply arrives, or on the same tick when
 * the tick waits for it.
 */
export class BackgroundDecisions {
  private readonly inFlightByAgentId = new Map<string, InFlightDecision>();

  isDeciding(state: WorldState, agentId: string): boolean {
    return this.inFlightByAgentId.get(agentId)?.state === state;
  }

  /** Starts a decision; one still pending for a replaced world is forgotten, not waited for. */
  start(state: WorldState, agentId: string, runDecision: () => Promise<DecisionPlan>): void {
    if (this.isDeciding(state, agentId)) {
      throw new Error(`${agentId} already has a decision in flight`);
    }
    const entry: InFlightDecision = {
      state,
      outcome: { kind: "pending" },
      settled: Promise.resolve(),
    };
    entry.settled = runDecision().then(
      (plan) => {
        entry.outcome = { kind: "planned", plan };
      },
      (error: unknown) => {
        entry.outcome = { kind: "failed", error };
      },
    );
    this.inFlightByAgentId.set(agentId, entry);
  }

  /** Resolves once every listed agent's decision in this world (if any) has returned. */
  async waitFor(state: WorldState, agentIds: readonly string[]): Promise<void> {
    const entries = agentIds
      .map((agentId) => this.inFlightByAgentId.get(agentId))
      .filter((entry) => entry?.state === state);
    await Promise.all(entries.map((entry) => entry?.settled));
  }

  /**
   * Removes and returns every finished plan for this world, in agent order so the result doesn't
   * depend on which reply came back first. A decision that threw is re-thrown here, on the tick.
   */
  collectFinished(state: WorldState): DecisionPlan[] {
    const plans: DecisionPlan[] = [];
    for (const [agentId, entry] of this.inFlightByAgentId) {
      if (entry.state !== state) this.inFlightByAgentId.delete(agentId);
    }
    for (const agent of state.agents) {
      const entry = this.inFlightByAgentId.get(agent.id);
      if (!entry || entry.state !== state || entry.outcome.kind === "pending") continue;
      this.inFlightByAgentId.delete(agent.id);
      if (entry.outcome.kind === "failed") {
        throw new Error(`Background decision for ${agent.id} failed`, {
          cause: entry.outcome.error,
        });
      }
      plans.push(entry.outcome.plan);
    }
    return plans;
  }
}
