import { describe, expect, it } from "vitest";
import { runSoak } from "./soak-run";

const SOAK_TICKS = 3 * 24 * 60;

describe("headless soak", () => {
  it("runs six agents on the fake LLM for three sim-days with no stuck agents or untraced acts", async () => {
    const report = await runSoak({ ticks: SOAK_TICKS });
    expect(report.problems).toEqual([]);
    expect(report.llmCalls).toBeGreaterThan(report.sim.state.agents.length);
    expect(report.sim.state.tick).toBe(SOAK_TICKS);
  }, 300_000);
});
