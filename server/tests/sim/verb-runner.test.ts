import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import {
  createEntity,
  findEntityIfPresent,
  listContents,
  locateInside,
} from "../../src/items/entity-store";
import { SQUARE, contextOf, lastFailure } from "./combat-test-kit";
import { OPEN_GROUND } from "./rule-test-kit";
import { giveEntity, setUpSteps } from "./steps/step-test-kit";
import type { Entity } from "@village/shared";
import type { TestSim } from "../../src/sim/test-sim";
import { currentRun, placeEntity, resumeVerb, startVerb } from "./verb-run-test-kit";
import { cancelRunningVerb } from "../../src/sim/verb-runner";
import { replaceAgent } from "../../src/sim/world-access";

function loadOven(sim: TestSim, oven: Entity, definitionIds: readonly string[]): void {
  for (const definitionId of definitionIds) {
    createEntity(sim.state, definitionId, locateInside(oven.id));
  }
}

function loadBakingSupplies(sim: TestSim, oven: Entity): void {
  loadOven(sim, oven, ["flour", "flour", "water"]);
}

function countInside(sim: TestSim, holder: Entity, definitionId: string): number {
  return listContents(sim.state, holder.id).filter((entity) => entity.definitionId === definitionId)
    .length;
}

describe("starting a verb", () => {
  it("changes nothing when a step refuses", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    loadOven(sim, oven, ["water"]);
    const context = startVerb(sim, "mara", "bake bread", { items: [oven] });
    expect(countInside(sim, oven, "water")).toBe(1);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
    expect(context.result.verbStarts).toEqual([]);
    expect(lastFailure(sim, "mara")).toMatch(/^I tried to bake bread at the oven but /);
  });

  it("runs the steps above the first wait now and those below it when the wait ends", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    loadBakingSupplies(sim, oven);
    const started = startVerb(sim, "mara", "bake bread", { items: [oven] });
    expect(countInside(sim, oven, "flour")).toBe(0);
    expect(countInside(sim, oven, "water")).toBe(0);
    expect(countInside(sim, oven, "bread")).toBe(0);
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
    expect(countInside(sim, oven, "bread")).toBe(4);
    expect(sim.agent("mara").needs.energy).toBeLessThan(energyBefore);
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(currentRun(sim, "mara")).toBeNull();
  });

  it("keeps what earlier steps did and never runs later ones when interrupted", () => {
    const sim = setUpSteps();
    const oven = placeEntity(sim, "oven", OPEN_GROUND);
    loadBakingSupplies(sim, oven);
    startVerb(sim, "mara", "bake bread", { items: [oven] });
    cancelRunningVerb(contextOf(sim), "mara");
    expect(countInside(sim, oven, "flour")).toBe(0);
    expect(countInside(sim, oven, "bread")).toBe(0);
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
    loadBakingSupplies(sim, oven);
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

function exhaust(sim: TestSim, agentId: string): void {
  const agent = sim.agent(agentId);
  replaceAgent(sim.state, { ...agent, needs: { ...agent.needs, energy: 0.05 } });
}

function minutesUntilDone(sim: TestSim, agentId: string): number {
  const endsAtTick = sim.agent(agentId).currentAction?.endsAtTick ?? sim.state.tick;
  return (endsAtTick - sim.state.tick) * config.clock.minutesPerTick;
}

function startBaking(sim: TestSim): void {
  const oven = placeEntity(sim, "oven", OPEN_GROUND);
  loadBakingSupplies(sim, oven);
  startVerb(sim, "mara", "bake bread", { items: [oven] });
}

describe("slowed by pressing needs", () => {
  it("takes longer when exhausted and tells the agent why as it starts", () => {
    const rested = setUpSteps();
    startBaking(rested);
    const tired = setUpSteps();
    exhaust(tired, "mara");
    startBaking(tired);
    expect(minutesUntilDone(tired, "mara")).toBeGreaterThan(minutesUntilDone(rested, "mara"));
    expect(tired.streamTexts("mara").at(-1)).toContain(
      "This will take longer than usual because I'm exhausted",
    );
    expect(rested.streamTexts("mara").join(" ")).not.toContain("longer than usual");
  });

  it("tells only the agent itself that it finished slowly", () => {
    const sim = setUpSteps();
    exhaust(sim, "mara");
    startBaking(sim);
    const finishEvent = resumeVerb(sim, "mara").result.events.at(-1);
    expect(finishEvent?.description).toBe("finished baking bread at the oven, making 4 bread");
    expect(finishEvent?.actorDescription).toBe(
      "finished baking bread at the oven, making 4 bread, slowly, because I was exhausted",
    );
  });
});
