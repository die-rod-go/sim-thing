import { describe, expect, it } from "vitest";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { addComponent } from "../../src/items/thing-writes";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { contextOf, entityThing } from "./combat-test-kit";

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

  it("lets two walkers meeting in a doorway trade places", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: () => decisionReply({ action: "walk_to", target: "town square" }),
        Ilsa: () => decisionReply({ action: "walk_to", target: "rose cottage" }),
      }),
    });
    sim.placeAgent("mara", { x: ROSE_COTTAGE_DOORWAY.x, y: ROSE_COTTAGE_DOORWAY.y - 1 });
    sim.placeAgent("ilsa", { x: ROSE_COTTAGE_DOORWAY.x, y: ROSE_COTTAGE_DOORWAY.y + 1 });
    for (let tick = 0; tick < 40; tick += 1) {
      await sim.advance();
      expect(sim.agent("mara").pos).not.toEqual(sim.agent("ilsa").pos);
    }
    expect(sim.agent("mara").place).toBe("town square");
    expect(sim.agent("ilsa").place).toBe("rose cottage");
    expect(sim.agent("ilsa").pos).not.toEqual({
      x: ROSE_COTTAGE_DOORWAY.x,
      y: ROSE_COTTAGE_DOORWAY.y - 1,
    });
  });

  it("trades places with an agent standing in the only way out", async () => {
    const sim = createWalkToSquareSim();
    sim.placeAgent("mara", ROSE_COTTAGE_INSIDE);
    sim.placeAgent("ilsa", ROSE_COTTAGE_DOORWAY);
    for (let tick = 0; tick < 60; tick += 1) {
      await sim.advance();
      expect(sim.agent("mara").pos).not.toEqual(sim.agent("ilsa").pos);
    }
    expect(sim.agent("mara").place).toBe("town square");
    expect(sim.agent("ilsa").pos).toEqual({
      x: ROSE_COTTAGE_DOORWAY.x,
      y: ROSE_COTTAGE_DOORWAY.y - 1,
    });
    expect(sim.streamTexts("mara").join("\n")).not.toContain("was in the way");
  });

  it("names the locked door that stands in the only way in", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0 ? decisionReply({ action: "walk_to", target: "bakery" }) : undefined,
      }),
    });
    const door = entityThing(findEntityByLabel(sim.state, "bakery door"));
    addComponent(contextOf(sim), door, "closed", { minutes: null });
    addComponent(contextOf(sim), door, "locked", { minutes: null });
    sim.placeAgent("mara", { x: 19, y: 15 });
    await sim.advance();
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toBe(
      "I tried to walk to the bakery but the bakery door is closed and locked",
    );
  });
});
