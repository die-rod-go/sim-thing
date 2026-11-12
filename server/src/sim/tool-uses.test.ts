import { describe, expect, it } from "vitest";
import { countHeld, createEntity, listHeldEntities, locateInside } from "../items/entity-store";
import { describeBelongings } from "../decision/sections";
import type { InteractRequest } from "./agent-runtime";
import { buildBelongings } from "./prompt-entities";
import { createTestSim, decisionReply, promptOf, type TestSim } from "./test-sim";
import { resolveInteract } from "./verb-resolve";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_SQUARE = { x: 20, y: 15 };
const FELLING_MINUTES = 60;

function buildWoodlotSim(responder: Parameters<typeof createTestSim>[0]["responder"]): TestSim {
  const sim = createTestSim({ agentIds: ["mara"], responder });
  for (const entity of listHeldEntities(sim.state, "mara")) {
    sim.state.entities = sim.state.entities.filter((candidate) => candidate.id !== entity.id);
  }
  sim.placeAgent("mara", SQUARE);
  const { place } = sim.agent("mara");
  createEntity(sim.state, "tree", { kind: "tile", place, pos: NEXT_TO_SQUARE });
  return sim;
}

function buildIdleWoodlotSim(): TestSim {
  return buildWoodlotSim(() => decisionReply({ action: "wait", minutes: 1 }));
}

function giveMara(sim: TestSim, definitionId: string): void {
  createEntity(sim.state, definitionId, locateInside("mara"));
}

function resolveItemName(sim: TestSim, request: InteractRequest): string {
  const resolution = resolveInteract(sim.state, "mara", request);
  if (resolution.kind !== "ready") throw new Error(`not ready: ${resolution.reason}`);
  return resolution.start.itemName;
}

describe("verbs done with a carried tool", () => {
  it("chops down the target when the reply names the axe as the item", () => {
    const sim = buildIdleWoodlotSim();
    giveMara(sim, "axe");
    expect(resolveItemName(sim, { verb: "chop down", itemName: "axe", targetName: "tree" })).toBe(
      "tree",
    );
  });

  it("chops down the nearest tree when the reply names only the axe", () => {
    const sim = buildIdleWoodlotSim();
    giveMara(sim, "axe");
    expect(resolveItemName(sim, { verb: "chop down", itemName: "axe" })).toBe("tree");
  });

  it("keeps the named item when it isn't the verb's tool and no target is named", () => {
    const sim = buildIdleWoodlotSim();
    giveMara(sim, "bread");
    const resolution = resolveInteract(sim.state, "mara", { verb: "chop down", itemName: "bread" });
    expect(resolution.kind === "failed" && resolution.reason).toBe("I can't 'chop down' bread");
  });

  it("offers chopping the tree when the axe is aimed at it with a verb that can't", () => {
    const sim = buildIdleWoodlotSim();
    giveMara(sim, "axe");
    const resolution = resolveInteract(sim.state, "mara", {
      verb: "attack",
      itemName: "axe",
      targetName: "tree",
    });
    if (resolution.kind !== "failed") throw new Error("resolved, but a failure was expected");
    expect(resolution.followUp?.choices).toContainEqual({
      label: "chop down the tree",
      verbName: "chop down",
      itemName: "tree",
    });
  });

  it("lists what a carried tool lets the agent do here beside its own verbs", () => {
    const sim = buildIdleWoodlotSim();
    giveMara(sim, "axe");
    const belongings = describeBelongings(buildBelongings(sim.state, sim.agent("mara")), []);
    expect(belongings).toMatch(/- an axe \((?:[a-z ]+, )*[a-z ]+; lets you chop down the tree\)/);
  });

  it("chops the tree after picking the tool use in the follow-up to a verb the axe lacks", async () => {
    const sim = buildWoodlotSim((request, callIndex) => {
      if (request.schemaName === "interact_reply") {
        return JSON.stringify({ verb: "chop down the tree" });
      }
      return callIndex === 0
        ? decisionReply({ action: "interact", item: "axe", verb: "fell" })
        : decisionReply({ action: "continue" });
    });
    giveMara(sim, "axe");
    await sim.advance();
    expect(promptOf(sim.client.requests[1]!)).toContain("- chop down the tree");
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "interact", verb: "chop down" });
    await sim.advance(FELLING_MINUTES);
    expect(countHeld(sim.state, "mara", "wood")).toBeGreaterThan(0);
  });
});
