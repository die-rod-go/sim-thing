import { describe, expect, it } from "vitest";
import { buildDecisionPrompt } from "../../src/decision/decision-prompt";
import { locateThing, type ThingRef } from "../../src/items/things";
import {
  BESIDE_SQUARE,
  addVerbs,
  NEXT_TO_SQUARE,
  SQUARE,
  aim,
  buildCombatSim,
  finish,
  killAgent,
  lastFailure,
} from "./combat-test-kit";
import { buildDecisionContext } from "../../src/sim/context-builder";
import type { TestSim } from "../../src/sim/test-sim";
import { toSavedWorld, restoreWorldState, createDefaultSettings } from "../../src/sim/world-state";

const TOBIAS_BODY = "Tobias's body";
const TOBIAS: ThingRef = { kind: "agent", agentId: "tobias" };
/** Open ground on the square, a few tiles from where the body fell. */
const ACROSS_SQUARE = { x: 17, y: 13 };

/** The verbs as `items.json` has them; the frozen test items predate them. */
const CARRYING_VERBS = [
  {
    name: "carry",
    target: {
      allOf: [{ definition: "person" }, { not: { has: "alive" } }, { where: "here" }],
    },
    steps: [
      { step: "wait", minutes: 2 },
      { step: "move", on: "target", into: "user" },
    ],
    phrases: {
      ongoing: "lifting {target}",
      done: "picked up {target}",
      attempt: "pick up {target}",
    },
  },
  {
    name: "lay down",
    target: { allOf: [{ definition: "person" }, { where: "held" }] },
    steps: [{ step: "move", on: "target", at: "user" }],
    phrases: {
      ongoing: "laying down {target}",
      done: "laid down {target}",
      attempt: "lay down {target}",
    },
  },
];

function buildCarryingSim(agentIds: string[]): TestSim {
  const sim = buildCombatSim(agentIds);
  addVerbs(sim, CARRYING_VERBS);
  return sim;
}

/** Mara and Ilsa on the square, beside Tobias's body. */
async function setUpBody(): Promise<TestSim> {
  const sim = buildCarryingSim(["mara", "tobias", "ilsa"]);
  sim.placeAgent("mara", SQUARE);
  sim.placeAgent("tobias", NEXT_TO_SQUARE);
  sim.placeAgent("ilsa", BESIDE_SQUARE);
  killAgent(sim, "tobias");
  await sim.advance();
  return sim;
}

function doVerb(sim: TestSim, agentId: string, verb: string): void {
  aim(sim, agentId, { verb, targetName: TOBIAS_BODY });
  if (sim.agent(agentId).currentAction !== null) finish(sim, agentId);
}

function promptLines(sim: TestSim, agentId: string): string[] {
  return buildDecisionPrompt(buildDecisionContext(sim.state, agentId, false)).split("\n");
}

describe("carrying a body", () => {
  it("picks up a body, which then goes wherever its carrier walks", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    expect(lastFailure(sim, "mara")).toBeNull();
    expect(sim.agent("tobias").bodyHolderId).toBe("mara");
    expect(locateThing(sim.state, TOBIAS)?.pos).toEqual(SQUARE);
    sim.placeAgent("mara", ACROSS_SQUARE);
    await sim.advance();
    expect(sim.agent("tobias").pos).toEqual(ACROSS_SQUARE);
  });

  it("lays a carried body down on the carrier's tile", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    sim.placeAgent("mara", ACROSS_SQUARE);
    await sim.advance();
    doVerb(sim, "mara", "lay down");
    expect(lastFailure(sim, "mara")).toBeNull();
    expect(sim.agent("tobias").bodyHolderId).toBeNull();
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(sim.agent("tobias").pos).toEqual(ACROSS_SQUARE);
  });

  it("won't pick up someone living", async () => {
    const sim = buildCarryingSim(["mara", "tobias"]);
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("tobias", NEXT_TO_SQUARE);
    aim(sim, "mara", { verb: "carry", targetName: "Tobias" });
    expect(lastFailure(sim, "mara")).not.toBeNull();
    expect(sim.agent("tobias").bodyHolderId).toBeNull();
  });

  it("won't take a body out of someone else's arms", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    doVerb(sim, "ilsa", "carry");
    expect(lastFailure(sim, "ilsa")).not.toBeNull();
    expect(sim.agent("tobias").bodyHolderId).toBe("mara");
  });

  it("shows the body as carried, to the carrier and to others in sight", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    await sim.advance();
    expect(promptLines(sim, "mara").join("\n")).toContain(
      `${TOBIAS_BODY}, next to you, carried by you`,
    );
    expect(promptLines(sim, "ilsa").join("\n")).toContain("carried by Mara");
  });

  it("is let go of where it was when its carrier's body is buried", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    killAgent(sim, "mara");
    await sim.advance();
    aim(sim, "ilsa", { verb: "bury", targetName: "Mara's body" });
    finish(sim, "ilsa");
    await sim.advance();
    expect(sim.agent("tobias").bodyHolderId).toBeNull();
    expect(locateThing(sim.state, TOBIAS)?.pos).toEqual(SQUARE);
  });

  it("stays carried through a save", async () => {
    const sim = await setUpBody();
    doVerb(sim, "mara", "carry");
    const saved = toSavedWorld(sim.state, createDefaultSettings());
    const { state } = restoreWorldState(
      JSON.parse(JSON.stringify(saved)),
      sim.state.map,
      sim.state.items,
    );
    expect(state.agents.find((agent) => agent.id === "tobias")?.bodyHolderId).toBe("mara");
  });
});
