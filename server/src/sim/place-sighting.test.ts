import { describe, expect, it } from "vitest";
import { getAgentRuntime } from "./agent-runtime";
import { createTestSim, decisionReply, findEntityByLabel, scriptByAgent } from "./test-sim";
import { replaceAgent } from "./world-access";

const SQUARE = { x: 19, y: 15 };
const ROSE_COTTAGE_INSIDE = { x: 5, y: 4 };

type TestSim = ReturnType<typeof createTestSim>;

/** Mara alone, having seen nothing yet. */
function createUnseenSim(responder = scriptByAgent({})): TestSim {
  const sim = createTestSim({ agentIds: ["mara"], responder });
  replaceAgent(sim.state, { ...sim.agent("mara"), seenPlaces: [] });
  return sim;
}

function findSeenPlace(sim: TestSim, placeName: string) {
  return sim.agent("mara").seenPlaces.find((seenPlace) => seenPlace.name === placeName);
}

function removeEntity(sim: TestSim, label: string): void {
  const removed = findEntityByLabel(sim.state, label);
  sim.state.entities = sim.state.entities.filter((entity) => entity.id !== removed.id);
}

describe("seen places", () => {
  it("starts a seeded place with what is really there at tick 0", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    expect(findSeenPlace(sim, "town square")).toEqual({
      name: "town square",
      firstSeenTick: 0,
      entities: { tick: 0, names: ["notice board", "bench"] },
    });
  });

  it("lists what the place around the agent holds, and never the open road", async () => {
    const sim = createUnseenSim();
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(findSeenPlace(sim, "town square")?.entities).toEqual({
      tick: 0,
      names: ["notice board", "bench"],
    });
    expect(findSeenPlace(sim, "village road")).toBeUndefined();
  });

  it("knows a building seen only from outside as not yet looked into", async () => {
    const sim = createUnseenSim();
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(findSeenPlace(sim, "bakery")).toEqual({
      name: "bakery",
      firstSeenTick: 0,
      entities: null,
    });
    expect(sim.records[0]?.prompt).toMatch(/^- bakery$/m);
    expect(sim.records[0]?.prompt).toContain("- town square (in view now): notice board, bench");
  });

  it("replaces a place's list while it is in view and keeps the last one after leaving", async () => {
    const sim = createUnseenSim();
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    removeEntity(sim, "bench");
    await sim.advance();
    const lastSeen = { tick: 1, names: ["notice board"] };
    expect(findSeenPlace(sim, "town square")?.entities).toEqual(lastSeen);
    sim.placeAgent("mara", ROSE_COTTAGE_INSIDE);
    removeEntity(sim, "notice board");
    await sim.advance();
    expect(findSeenPlace(sim, "town square")?.entities).toEqual(lastSeen);
  });

  it("sets out for a place the agent has only heard of", async () => {
    const sim = createUnseenSim(
      scriptByAgent({ Mara: () => decisionReply({ action: "walk_to", target: "The Tavern" }) }),
    );
    sim.placeAgent("mara", ROSE_COTTAGE_INSIDE);
    await sim.advance();
    expect(findSeenPlace(sim, "tavern")).toBeUndefined();
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "walk_to", target: "tavern" });
  });

  it("fails a walk to a name that is no place like any other action, without asking again", async () => {
    const sim = createUnseenSim(
      scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0 ? decisionReply({ action: "walk_to", target: "river" }) : undefined,
      }),
    );
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    const failure = "I tried to walk to river but no place with that name exists";
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toBe(failure);
    expect(sim.agent("mara").workingMemory.some((entry) => entry.endsWith(failure))).toBe(true);
    expect(sim.records).toHaveLength(1);
    expect(sim.results[0]?.events.map((event) => event.kind)).toContain("action_failed");
  });
});
