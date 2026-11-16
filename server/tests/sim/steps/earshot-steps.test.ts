import { describe, expect, it } from "vitest";
import type { Position } from "@village/shared";
import { addComponent, removeComponent } from "../../../src/items/thing-writes";
import { aim, buildCombatSim, contextOf, entityThing, finish, handOver } from "../combat-test-kit";
import { placeThing } from "../rule-test-kit";
import { findEntityByLabel, type TestSim } from "../../../src/sim/test-sim";
import { replaceAgent } from "../../../src/sim/world-access";
import { emptyHands, runRuleSteps } from "./step-test-kit";

/** Inside the bakery, three tiles south of its door, and three tiles north of it outside. */
const IN_BAKERY = { x: 6, y: 14 };
const OUTSIDE_BAKERY = { x: 6, y: 8 };
const FAR_AWAY = { x: 33, y: 4 };
const START_FUN = 0.5;

function setUpBakery(agentIds: string[], positions: Record<string, Position>): TestSim {
  const sim = buildCombatSim(agentIds);
  for (const agentId of agentIds) {
    emptyHands(sim, agentId);
    sim.placeAgent(agentId, positions[agentId] ?? FAR_AWAY);
    const agent = sim.agent(agentId);
    replaceAgent(sim.state, { ...agent, needs: { ...agent.needs, fun: START_FUN } });
  }
  return sim;
}

function setBakeryDoorClosed(sim: TestSim, isClosed: boolean): void {
  const door = entityThing(findEntityByLabel(sim.state, "bakery door"));
  if (isClosed) addComponent(contextOf(sim), door, "closed", { minutes: null });
  else removeComponent(contextOf(sim), door, "closed");
}

/** Mara plays a lute in the bakery, as the fixture's `play` verb does. */
function playLute(sim: TestSim): void {
  handOver(sim, "mara", "lute");
  aim(sim, "mara", { verb: "play", itemName: "lute" });
  finish(sim, "mara");
}

function funOf(sim: TestSim, agentId: string): number {
  return sim.agent(agentId).needs.fun;
}

describe("change_need on earshot", () => {
  it("reaches a listener in the next room through an open door, but not the player twice", () => {
    const sim = setUpBakery(["mara", "tobias"], { mara: IN_BAKERY, tobias: OUTSIDE_BAKERY });
    setBakeryDoorClosed(sim, false);
    playLute(sim);
    expect(funOf(sim, "tobias")).toBeCloseTo(START_FUN + 0.1);
    expect(funOf(sim, "mara")).toBeCloseTo(START_FUN + 0.15);
  });

  it("is muffled out of reach by a closed door", () => {
    const sim = setUpBakery(["mara", "tobias"], { mara: IN_BAKERY, tobias: OUTSIDE_BAKERY });
    setBakeryDoorClosed(sim, true);
    playLute(sim);
    expect(funOf(sim, "tobias")).toBeCloseTo(START_FUN);
    expect(funOf(sim, "mara")).toBeCloseTo(START_FUN + 0.15);
  });

  it("doesn't reach someone too far away to hear", () => {
    const sim = setUpBakery(["mara", "tobias"], { mara: IN_BAKERY, tobias: FAR_AWAY });
    setBakeryDoorClosed(sim, false);
    playLute(sim);
    expect(funOf(sim, "tobias")).toBeCloseTo(START_FUN);
  });

  it("counts from the thing a rule fires on, rolling the chance for each listener", () => {
    const sim = setUpBakery(["mara", "tobias", "wren"], {
      mara: { x: 18, y: 15 },
      tobias: { x: 20, y: 15 },
      wren: FAR_AWAY,
    });
    const groundLute = placeThing(sim, "lute", { x: 19, y: 15 });
    const rolls = [0.1, 0.9];
    sim.state.random.next = () => rolls.shift() ?? 0.9;
    runRuleSteps(sim, groundLute, [
      { step: "change_need", on: "earshot", loudness: 4, need: "fun", amount: 0.2, chance: 0.5 },
    ]);
    expect(funOf(sim, "mara")).toBeCloseTo(START_FUN + 0.2);
    expect(funOf(sim, "tobias")).toBeCloseTo(START_FUN);
    expect(funOf(sim, "wren")).toBeCloseTo(START_FUN);
  });
});
