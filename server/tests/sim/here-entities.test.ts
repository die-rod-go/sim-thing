import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { createEntity } from "../../src/items/entity-store";
import { listHereEntities } from "../../src/sim/here-entities";
import { createTestSim, scriptByAgent } from "../../src/sim/test-sim";

const ROAD = config.map.defaultOutdoorPlace;
const ROAD_START = { x: 1, y: 9 };

function setUpOnRoad() {
  const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
  sim.placeAgent("mara", ROAD_START);
  return sim;
}

describe("listHereEntities", () => {
  it("lists only what is in sight on the open road", () => {
    const sim = setUpOnRoad();
    const near = createEntity(sim.state, "stone", {
      kind: "tile",
      place: ROAD,
      pos: { x: 4, y: 9 },
    });
    const far = createEntity(sim.state, "stone", {
      kind: "tile",
      place: ROAD,
      pos: { x: ROAD_START.x + config.perception.sightRangeTiles + 2, y: 9 },
    });
    expect(sim.agent("mara").place).toBe(ROAD);
    const ids = listHereEntities(sim.state, sim.agent("mara")).map((entity) => entity.id);
    expect(ids).toContain(near.id);
    expect(ids).not.toContain(far.id);
  });

  it("lists everything in a named place, however far", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", { x: 14, y: 12 });
    const corner = createEntity(sim.state, "stone", {
      kind: "tile",
      place: "town square",
      pos: { x: 24, y: 18 },
    });
    expect(sim.agent("mara").place).toBe("town square");
    const ids = listHereEntities(sim.state, sim.agent("mara")).map((entity) => entity.id);
    expect(ids).toContain(corner.id);
  });
});
