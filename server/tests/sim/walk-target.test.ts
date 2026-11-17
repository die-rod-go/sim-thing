import { describe, expect, it } from "vitest";
import { createEntity } from "../../src/items/entity-store";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { replaceAgent } from "../../src/sim/world-access";
import { describeLocation } from "../../src/world/place-names";

const SQUARE = { x: 19, y: 15 };
const TAVERN_FLOOR = { x: 30, y: 14 };
const ROSE_COTTAGE_INSIDE = { x: 5, y: 4 };

/** Mara, having seen nothing, walking once to the given name from the town square or `start`. */
function createWalkSim(targetName: string, start = SQUARE) {
  const sim = createTestSim({
    agentIds: ["mara"],
    responder: scriptByAgent({
      Mara: (_request, callIndex) =>
        callIndex === 0 ? decisionReply({ action: "walk_to", target: targetName }) : undefined,
    }),
  });
  replaceAgent(sim.state, { ...sim.agent("mara"), seenPlaces: [] });
  sim.placeAgent("mara", start);
  return sim;
}

function findWalkEntityId(sim: ReturnType<typeof createWalkSim>): string | null {
  const destination = getAgentRuntime(sim.state, "mara").walk?.destination;
  return destination?.kind === "entity" ? destination.entityId : null;
}

describe("walk_to names", () => {
  it("walks to a map object in another place by its name", async () => {
    const sim = createWalkSim("brew kettle");
    await sim.advance();
    expect(findWalkEntityId(sim)).toBe(findEntityByLabel(sim.state, "brew kettle").id);
  });

  it("walks to the map object whose name shares the most words with a loose one", async () => {
    const sim = createWalkSim("the back door");
    await sim.advance();
    expect(findWalkEntityId(sim)).toBe(findEntityByLabel(sim.state, "tavern back door").id);
  });

  it("names the real destination in the walk, so a loose name corrects itself", async () => {
    const sim = createWalkSim("kettle");
    await sim.advance();
    const started = sim.results[0]?.events.find((event) => event.kind === "walk_started");
    expect(started?.description).toBe("started walking to the brew kettle");
  });

  it("does not add a place found by name to the seen places before it is seen", async () => {
    const sim = createWalkSim("brew kettle", ROSE_COTTAGE_INSIDE);
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({ target: "brew kettle" });
    expect(sim.agent("mara").seenPlaces.some((seen) => seen.name === "tavern")).toBe(false);
  });

  it("never finds a loose item lying in another place", async () => {
    const sim = createWalkSim("bread");
    createEntity(sim.state, "bread", { kind: "tile", place: "tavern", pos: TAVERN_FLOOR });
    await sim.advance();
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toBe(
      "I tried to walk to bread but nothing in the village goes by that name",
    );
  });

  it("fails only when nothing in the village has a name like it", async () => {
    const sim = createWalkSim("linen shop");
    await sim.advance();
    expect(getAgentRuntime(sim.state, "mara").walk ?? null).toBeNull();
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toContain(
      "nothing in the village goes by that name",
    );
  });

  it("walks to the road by a place by the name it goes by", async () => {
    const sim = createWalkSim("the road by the bakery");
    await sim.advance(40);
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toBeNull();
    expect(describeLocation(sim.state.map, sim.agent("mara").place, sim.agent("mara").pos)).toBe(
      "the road by the bakery",
    );
  });
});
