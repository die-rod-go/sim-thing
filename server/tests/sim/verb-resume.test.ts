import { describe, expect, it } from "vitest";
import { createEntity, locateInside } from "../../src/items/entity-store";
import { readNumberField, type ThingRef } from "../../src/items/things";
import { lastFailure, readHealth, setAgentHealth } from "./combat-test-kit";
import { OPEN_GROUND, TOBIAS } from "./rule-test-kit";
import { giveEntity, setUpSteps } from "./steps/step-test-kit";
import type { TestSim } from "../../src/sim/test-sim";
import { currentRun, placeEntity, resumeVerb, startVerb } from "./verb-run-test-kit";

const FAR_ON_SQUARE = { x: 22, y: 15 };
const HIT = 0;
const MISS = 0.99;

function startAttack(sim: TestSim) {
  const knife = giveEntity(sim, "mara", "knife");
  const started = startVerb(sim, "mara", "attack", {
    items: [knife],
    target: TOBIAS,
    targetName: "Tobias",
  });
  return { knife, started };
}

function readKnifeHealth(sim: TestSim, knife: { id: string }): number | null {
  const thing: ThingRef = { kind: "entity", entityId: knife.id };
  return readNumberField(sim.state, thing, "health.current");
}

describe("resuming a verb", () => {
  it("lands the later steps on a hit and announces the hit without a finish", () => {
    const sim = setUpSteps(HIT);
    const { started } = startAttack(sim);
    expect(started.result.events).toMatchObject([
      {
        kind: "action_started",
        description: "started attacking Tobias with a knife",
        targetDescription: "started attacking me with a knife",
        loudness: 6,
      },
    ]);
    const healthBefore = readHealth(sim, "tobias");
    const resumed = resumeVerb(sim, "mara");
    expect(readHealth(sim, "tobias")).toBeLessThan(healthBefore);
    expect(resumed.result.events[0]).toMatchObject({
      kind: "attacked",
      description: "hit Tobias with a knife",
      targetDescription: "hit me with a knife",
      loudness: 6,
    });
    expect(resumed.result.events.some((event) => event.kind === "action_finished")).toBe(false);
  });

  it("skips steps after a missed roll unless they say evenOnMiss", () => {
    const sim = setUpSteps(MISS);
    const { knife } = startAttack(sim);
    const healthBefore = readHealth(sim, "tobias");
    const knifeBefore = readKnifeHealth(sim, knife);
    const resumed = resumeVerb(sim, "mara");
    expect(readHealth(sim, "tobias")).toBe(healthBefore);
    expect(readKnifeHealth(sim, knife)).toBeCloseTo((knifeBefore ?? 0) - 0.02, 9);
    expect(resumed.result.events).toMatchObject([
      { kind: "missed", description: "swung a knife at Tobias and missed" },
    ]);
  });

  it("counts a target only out of reach at the roll as a miss", () => {
    const sim = setUpSteps(HIT);
    const { knife } = startAttack(sim);
    const healthBefore = readHealth(sim, "tobias");
    const knifeBefore = readKnifeHealth(sim, knife);
    sim.placeAgent("tobias", FAR_ON_SQUARE);
    const resumed = resumeVerb(sim, "mara");
    expect(readHealth(sim, "tobias")).toBe(healthBefore);
    expect(readKnifeHealth(sim, knife)).toBeCloseTo((knifeBefore ?? 0) - 0.02, 9);
    expect(resumed.result.events.map((event) => event.kind)).toEqual(["missed"]);
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("fails the verb when the target stopped matching during the wait", () => {
    const sim = setUpSteps(HIT);
    startAttack(sim);
    setAgentHealth(sim, "tobias", 0);
    resumeVerb(sim, "mara");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to attack Tobias with a knife but I couldn't attack Tobias any more",
    );
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
  });

  it("fails the verb when someone else took the item during the wait", () => {
    const sim = setUpSteps(HIT);
    const { knife } = startAttack(sim);
    const entity = sim.state.entities.find((candidate) => candidate.id === knife.id);
    if (!entity) throw new Error("the knife is gone");
    entity.location = locateInside("tobias");
    resumeVerb(sim, "mara");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to attack Tobias with a knife but someone got to it first",
    );
  });

  it("fails the verb when a step refuses at resume, keeping earlier effects", () => {
    const sim = setUpSteps();
    const board = placeEntity(sim, "notice_board", OPEN_GROUND);
    startVerb(sim, "mara", "post a note", { items: [board], choice: { text: "Bread for sale" } });
    for (let count = 0; count < 30; count += 1) {
      createEntity(sim.state, "note", locateInside(board.id));
    }
    resumeVerb(sim, "mara");
    expect(lastFailure(sim, "mara")).toMatch(/^I tried to post a note on the notice board but /);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(sim.state.entities.filter((entity) => entity.definitionId === "note")).toHaveLength(30);
  });
});
