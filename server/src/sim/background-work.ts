import type { WorldState } from "./world-state";

type WorkOutcome<Outcome> =
  { kind: "pending" } | { kind: "finished"; value: Outcome } | { kind: "failed"; error: unknown };

interface InFlightWork<Outcome> {
  /** The world the work was started in; results for a replaced world (e.g. after a reset) are dropped. */
  state: WorldState;
  outcome: WorkOutcome<Outcome>;
  /** Settles (never rejects) once the outcome is no longer pending. */
  settled: Promise<void>;
}

/**
 * Per-agent LLM work (decisions, summaries, passes) that may run while the clock keeps going:
 * each piece starts on the tick it is asked for and its result is collected on the first tick
 * after it returns, or on the same tick when the tick waits for it. One piece per agent at a time.
 */
export class BackgroundWork<Outcome> {
  private readonly inFlightByAgentId = new Map<string, InFlightWork<Outcome>>();

  /** Names the work in errors, e.g. "decision". */
  constructor(private readonly workName: string) {}

  isRunning(state: WorldState, agentId: string): boolean {
    return this.inFlightByAgentId.get(agentId)?.state === state;
  }

  /** Starts work for an agent; work still pending for a replaced world is forgotten, not waited for. */
  start(state: WorldState, agentId: string, run: () => Promise<Outcome>): void {
    if (this.isRunning(state, agentId)) {
      throw new Error(`${agentId} already has a ${this.workName} in flight`);
    }
    const entry: InFlightWork<Outcome> = {
      state,
      outcome: { kind: "pending" },
      settled: Promise.resolve(),
    };
    entry.settled = run().then(
      (value) => {
        entry.outcome = { kind: "finished", value };
      },
      (error: unknown) => {
        entry.outcome = { kind: "failed", error };
      },
    );
    this.inFlightByAgentId.set(agentId, entry);
  }

  /** True while any work started in this world has not been collected yet. */
  hasAnyInFlight(state: WorldState): boolean {
    for (const entry of this.inFlightByAgentId.values()) {
      if (entry.state === state) return true;
    }
    return false;
  }

  /**
   * Resolves once every listed agent's work in this world (if any) has returned, or after
   * `maxWaitMs` of real time when given; work still pending then keeps running.
   */
  async waitFor(state: WorldState, agentIds: readonly string[], maxWaitMs?: number): Promise<void> {
    const entries = agentIds
      .map((agentId) => this.inFlightByAgentId.get(agentId))
      .filter((entry) => entry?.state === state);
    if (entries.length === 0) return;
    const allSettled = Promise.all(entries.map((entry) => entry?.settled));
    if (maxWaitMs === undefined) {
      await allSettled;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeLimit = new Promise<void>((resolveTimeLimit) => {
      timer = setTimeout(resolveTimeLimit, maxWaitMs);
    });
    try {
      await Promise.race([allSettled, timeLimit]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolves once all work started in this world has returned. */
  waitForAll(state: WorldState): Promise<void> {
    return this.waitFor(state, [...this.inFlightByAgentId.keys()]);
  }

  /**
   * Removes and returns every finished result for this world, in agent order so the outcome doesn't
   * depend on which reply came back first. Work that threw is re-thrown here, on the tick.
   */
  collectFinished(state: WorldState): Outcome[] {
    const results: Outcome[] = [];
    for (const [agentId, entry] of this.inFlightByAgentId) {
      if (entry.state !== state) this.inFlightByAgentId.delete(agentId);
    }
    for (const agent of state.agents) {
      const entry = this.inFlightByAgentId.get(agent.id);
      if (!entry || entry.state !== state || entry.outcome.kind === "pending") continue;
      this.inFlightByAgentId.delete(agent.id);
      if (entry.outcome.kind === "failed") {
        throw new Error(`Background ${this.workName} for ${agent.id} failed`, {
          cause: entry.outcome.error,
        });
      }
      results.push(entry.outcome.value);
    }
    return results;
  }
}
