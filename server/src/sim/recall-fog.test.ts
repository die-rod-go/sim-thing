import { describe, expect, it } from "vitest";
import { buildDecisionContext } from "./context-builder";
import { runRecall } from "./decision-runner";
import { createTestSim, scriptByAgent, type TestSim } from "./test-sim";
import { findAgent, replaceAgent } from "./world-access";

const QUERY = "What do I know about Tobias?";
const CERTAIN_FAILURE_ROLL = 0;
const CERTAIN_SUCCESS_ROLL = 0.999;

function buildSim(): TestSim {
  return createTestSim({ agentIds: ["mara", "tobias"], responder: scriptByAgent({}) });
}

function exhaust(sim: TestSim): void {
  const agent = findAgent(sim.state, "mara");
  replaceAgent(sim.state, { ...agent, needs: { ...agent.needs, energy: 0.05 } });
}

function listStrengths(sim: TestSim): number[] {
  return sim.state.memoryStore.listByAgent("mara").map((memory) => memory.strength);
}

describe("recall fog", () => {
  it("fails an exhausted agent's recall and says why", () => {
    const sim = buildSim();
    exhaust(sim);
    const lines = runRecall(sim.state, sim.agent("mara"), QUERY, CERTAIN_FAILURE_ROLL);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      `I tried to recall "${QUERY}" but couldn't think straight because I'm exhausted`,
    );
  });

  it("leaves memories untouched when recall fails", () => {
    const sim = buildSim();
    exhaust(sim);
    const strengthsBefore = listStrengths(sim);
    runRecall(sim.state, sim.agent("mara"), QUERY, CERTAIN_FAILURE_ROLL);
    expect(listStrengths(sim)).toEqual(strengthsBefore);
  });

  it("recalls normally when the roll misses the fog", () => {
    const sim = buildSim();
    exhaust(sim);
    const lines = runRecall(sim.state, sim.agent("mara"), QUERY, CERTAIN_SUCCESS_ROLL);
    expect(lines.some((line) => line.includes("I recall: Tobias:"))).toBe(true);
  });

  it("brings no memories to mind on their own when fogged, and names the cause", () => {
    const sim = buildSim();
    exhaust(sim);
    const fogged = buildDecisionContext(sim.state, "mara", false, {
      passiveRecallRoll: CERTAIN_FAILURE_ROLL,
    });
    expect(fogged.foggedBy).toBe("exhausted");
    expect(Object.values(fogged.recalledMemories).flat()).toHaveLength(0);
    const clear = buildDecisionContext(sim.state, "mara", false, {
      passiveRecallRoll: CERTAIN_SUCCESS_ROLL,
    });
    expect(clear.foggedBy).toBeNull();
    expect(Object.values(clear.recalledMemories).flat().length).toBeGreaterThan(0);
  });
});
