import { describe, expect, it } from "vitest";
import { config } from "../config";
import { countHeld, findEntityIfPresent } from "../items/entity-store";
import { SQUARE, contextOf, lastFailure } from "./combat-test-kit";
import { OPEN_GROUND } from "./rule-test-kit";
import { giveEntity, setUpSteps } from "./steps/step-test-kit";
import type { TestSim } from "./test-sim";
import { currentRun, placeEntity, resumeVerb, startVerb } from "./verb-run-test-kit";
import { cancelRunningVerb } from "./verb-runner";
import { replaceAgent } from "./world-access";

function giveBakingSupplies(sim: TestSim): void {
  giveEntity(sim, "mara", "wheat");
  giveEntity(sim, "mara", "wheat");
  giveEntity(sim, "mara", "wood");
}

describe("starting a verb", () => {
  it("changes nothing when a step refuses", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    giveEntity(sim, "mara", "wood");
    const context = startVerb(sim, "mara", "bake bread", { items: [oven] });
    expect(countHeld(sim.state, "mara", "wood")).toBe(1);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
    expect(context.result.verbStarts).toEqual([]);
    expect(lastFailure(sim, "mara")).toMatch(/^I tried to bake bread at the oven but /);
  });

  it("runs the steps above the first wait now and those below it when the wait ends", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    giveBakingSupplies(sim);
    const started = startVerb(sim, "mara", "bake bread", { items: [oven] });
    expect(countHeld(sim.state, "mara", "wheat")).toBe(0);
    expect(countHeld(sim.state, "mara", "wood")).toBe(0);
    expect(countHeld(sim.state, "mara", "bread")).toBe(0);
    expect(sim.agent("mara").currentAction).toMatchObject({
      kind: "interact",
      verb: "bake bread",
      endsAtTick: sim.state.tick + Math.ceil(90 / config.clock.minutesPerTick),
    });
    expect(started.result.verbStarts).toEqual([
      { agentId: "mara", entityId: oven.id, verb: "bake bread" },
    ]);
    const energyBefore = sim.agent("mara").needs.energy;
    resumeVerb(sim, "mara");
    expect(countHeld(sim.state, "mara", "bread")).toBe(4);
    expect(sim.agent("mara").needs.energy).toBeLessThan(energyBefore);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
  });

  it("keeps what earlier steps did and never runs later ones when interrupted", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    giveBakingSupplies(sim);
    startVerb(sim, "mara", "bake bread", { items: [oven] });
    cancelRunningVerb(contextOf(sim), "mara");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(0);
    expect(countHeld(sim.state, "mara", "bread")).toBe(0);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
  });

  it("cuts the words of a choice to the longest text a verb gets", () => {
    const sim = setUpSteps();
    const board = placeEntity(sim, "notice_board", OPEN_GROUND);
    const words = "x".repeat(config.verbs.maxTextChars + 50);
    startVerb(sim, "mara", "post a note", { items: [board], choice: { text: words } });
    expect(currentRun(sim, "mara")?.choice.text).toHaveLength(config.verbs.maxTextChars);
  });
});

describe("the events of a verb", () => {
  it("announces the start at the first wait with its loudness, and the finish with what was made", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    giveBakingSupplies(sim);
    const started = startVerb(sim, "mara", "bake bread", { items: [oven] });
    expect(started.result.events).toMatchObject([
      { kind: "action_started", description: "started baking bread at the oven", loudness: 3 },
    ]);
    const finished = resumeVerb(sim, "mara");
    expect(finished.result.events).toMatchObject([
      {
        kind: "action_finished",
        description: "finished baking bread at the oven, making 4 bread",
        targetName: "oven",
      },
    ]);
  });

  it("announces a verb with no wait by its done phrase, counting the stack", () => {
    const sim = setUpSteps();
    const bread = [giveEntity(sim, "mara", "bread"), giveEntity(sim, "mara", "bread")];
    const dropped = startVerb(sim, "mara", "drop", { items: bread, itemName: "2 bread" });
    expect(dropped.result.events).toMatchObject([
      { kind: "action_finished", description: "dropped 2 bread", loudness: null },
    ]);
    for (const entity of bread) {
      expect(findEntityIfPresent(sim.state, entity.id)?.location).toMatchObject({
        kind: "tile",
        pos: SQUARE,
      });
    }
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
  });
});

describe("a destroyed item", () => {
  it("is read from its snapshot by later steps", () => {
    const sim = setUpSteps();
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      needs: { ...sim.agent("mara").needs, hunger: 0.1 },
    });
    const bread = giveEntity(sim, "mara", "bread");
    startVerb(sim, "mara", "eat", { items: [bread] });
    expect(findEntityIfPresent(sim.state, bread.id)).toBeUndefined();
    expect(currentRun(sim, "mara")?.snapshots.item?.components.food).toBeDefined();
    expect(sim.agent("mara").needs.hunger).toBe(0.1);
    const finished = resumeVerb(sim, "mara");
    expect(sim.agent("mara").needs.hunger).toBeGreaterThan(0.1);
    expect(finished.result.events[0]?.description).toBe("finished eating bread");
  });
});
