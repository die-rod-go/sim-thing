import { describe, expect, it } from "vitest";
import { getAgentRuntime } from "./agent-runtime";
import { createTestSim, decisionReply, scriptByAgent } from "./test-sim";

const ROSE_COTTAGE_INSIDE = { x: 4, y: 4 };
const ROSE_COTTAGE_DOORWAY = { x: 4, y: 6 };

function createWalkToSquareSim() {
  return createTestSim({
    agentIds: ["mara", "ilsa"],
    responder: scriptByAgent({
      Mara: () => decisionReply({ action: "walk_to", target: "town square" }),
    }),
  });
}

describe("walking", () => {
  it("walks around another agent standing on the path, never sharing a tile", async () => {
    const sim = createWalkToSquareSim();
    sim.placeAgent("mara", { x: 6, y: 9 });
    sim.placeAgent("ilsa", { x: 30, y: 26 });
    await sim.advance();
    const nextStep = getAgentRuntime(sim.state, "mara").walk?.remainingSteps[0];
    if (!nextStep) throw new Error("Mara should be walking");
    sim.placeAgent("ilsa", nextStep);
    for (let tick = 0; tick < 40; tick += 1) {
      await sim.advance();
      expect(sim.agent("mara").pos).not.toEqual(sim.agent("ilsa").pos);
    }
    expect(sim.agent("mara").place).toBe("town square");
  });

  it("gives up a walk when another agent blocks the only way out", async () => {
    const sim = createWalkToSquareSim();
    sim.placeAgent("mara", ROSE_COTTAGE_INSIDE);
    sim.placeAgent("ilsa", ROSE_COTTAGE_DOORWAY);
    await sim.advance(10);
    expect(sim.agent("mara").place).toBe("rose cottage");
    expect(sim.agent("mara").workingMemory.join("\n")).toContain(
      "I tried to walk to the town square but Ilsa was in the way",
    );
  });
});
