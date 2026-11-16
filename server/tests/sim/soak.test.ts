import { describe, expect, it } from "vitest";
import { runSoak } from "../../src/sim/soak-run";

// A smoke run only: the full multi-day soak takes minutes, so it runs on its own via `make soak`.
const SMOKE_SOAK_TICKS = 3 * 60;

describe("headless soak", () => {
  it("runs six agents on the fake LLM for three sim-hours with no stuck agents or untraced acts", async () => {
    const report = await runSoak({ ticks: SMOKE_SOAK_TICKS });
    expect(report.problems).toEqual([]);
    expect(report.llmCalls).toBeGreaterThan(report.sim.state.agents.length);
    expect(report.sim.state.tick).toBe(SMOKE_SOAK_TICKS);
  });
});
