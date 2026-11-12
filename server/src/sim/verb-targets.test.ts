import { describe, expect, it } from "vitest";
import { config } from "../config";
import { buildDecisionPrompt } from "../decision/decision-prompt";
import { countHeld, removeEntity } from "../items/entity-store";
import { getAgentRuntime } from "./agent-runtime";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  addVerbs,
  aim,
  aimWith,
  buildCombatSim,
  contextOf,
  finish,
  fixRolls,
  handOver,
  lastFailure,
  memoryTexts,
  place,
  readHealth,
  setAgentHealth,
} from "./combat-test-kit";
import { buildDecisionContext } from "./context-builder";
import { createTestSim, decisionReply, scriptByAgent } from "./test-sim";
import { advanceWalk } from "./walking";
import { replaceAgent } from "./world-access";

const FOUR_TILES_AWAY = { x: 23, y: 15 };
const FAR_OUT_OF_SIGHT = { x: 3, y: 4 };
const ALWAYS_MISS = 0.99;

function walkTicks(sim: ReturnType<typeof buildCombatSim>, agentId: string, ticks: number) {
  for (let count = 0; count < ticks; count += 1) {
    advanceWalk(contextOf(sim), agentId);
    sim.state.tick += 1;
  }
}

describe("aiming a verb", () => {
  it("heals with a bandage aimed at yourself and uses it up", () => {
    const sim = buildCombatSim(["mara"]);
    setAgentHealth(sim, "mara", 0.5);
    const bandage = handOver(sim, "mara", "bandage");
    aimWith(sim, "mara", bandage, "use", "yourself");
    finish(sim, "mara");
    expect(readHealth(sim, "mara")).toBeCloseTo(0.65, 9);
    expect(countHeld(sim.state, "mara", "bandage")).toBe(0);
    expect(memoryTexts(sim, "mara")).toContain("I finished bandaging myself with a bandage");
  });

  it("refuses to aim a verb at oneself when it can't be", () => {
    const sim = buildCombatSim(["mara"]);
    aim(sim, "mara", { verb: "punch", targetName: "yourself" });
    expect(lastFailure(sim, "mara")).toBe("I tried to punch yourself but I can't punch myself");
  });

  it("fails at finish when the weapon is no longer held", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const knife = handOver(sim, "mara", "knife");
    aimWith(sim, "mara", knife, "attack", "Tobias");
    removeEntity(sim.state, knife.id);
    finish(sim, "mara");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to attack Tobias with a knife but I no longer had the knife",
    );
  });

  it("fails at finish when the target is out of sight", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    aim(sim, "mara", { verb: "punch", targetName: "Tobias" });
    sim.placeAgent("tobias", FAR_OUT_OF_SIGHT);
    finish(sim, "mara");
    expect(lastFailure(sim, "mara")).toBe("I tried to punch Tobias but Tobias was already gone");
    expect(readHealth(sim, "tobias")).toBe(1);
  });

  it("misses a target who stepped out of reach during the swing", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    fixRolls(sim, 0);
    aim(sim, "mara", { verb: "punch", targetName: "Tobias" });
    sim.placeAgent("tobias", FOUR_TILES_AWAY);
    const finished = finish(sim, "mara");
    expect(finished.result.events.at(-1)?.kind).toBe("missed");
    expect(readHealth(sim, "tobias")).toBe(1);
  });

  it("walks to a target out of reach, then strikes", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: FOUR_TILES_AWAY });
    aim(sim, "mara", { verb: "punch", targetName: "Tobias" });
    expect(sim.agent("mara").currentAction?.kind).toBe("walk_to");
    walkTicks(sim, "mara", 4);
    expect(sim.agent("mara").currentAction?.verb).toBe("punch");
  });

  it("gives up on a target who keeps moving away", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: FOUR_TILES_AWAY });
    aim(sim, "mara", { verb: "punch", targetName: "Tobias" });
    const giveUpAtTick = getAgentRuntime(sim.state, "mara").walk?.giveUpAtTick ?? 0;
    for (let tick = sim.state.tick; tick <= giveUpAtTick; tick += 1) {
      const mara = sim.agent("mara");
      sim.placeAgent("tobias", { x: mara.pos.x + 3, y: mara.pos.y });
      walkTicks(sim, "mara", 1);
    }
    expect(lastFailure(sim, "mara")).toBe("I tried to punch Tobias but Tobias got away");
    expect(giveUpAtTick).toBeGreaterThanOrEqual(config.combat.chaseTicks);
  });
});

describe("verb steps and their modifiers", () => {
  it("needs its tools held", () => {
    const sim = buildCombatSim(["mara"]);
    addVerbs(sim, [
      {
        name: "whittle",
        appliesTo: { allOf: [{ definition: "wood" }, { where: "held" }] },
        steps: [
          { step: "require", in: "user", rule: { has: "sharp" } },
          { step: "wait", minutes: 1 },
          { step: "change_need", on: "user", need: "fun", amount: 0.1 },
        ],
        phrases: { attempt: "whittle the {item}" },
      },
    ]);
    const wood = handOver(sim, "mara", "wood");
    aimWith(sim, "mara", wood, "whittle");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to whittle the wood but I don't have what I need for that",
    );
    handOver(sim, "mara", "knife");
    aimWith(sim, "mara", wood, "whittle");
    expect(sim.agent("mara").currentAction?.verb).toBe("whittle");
  });

  it("runs steps above the wait at once, skips hit-only steps on a miss and rolls chance", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    addVerbs(sim, [
      {
        name: "shove",
        target: { allOf: [{ has: "alive" }, { not: { where: "self" } }] },
        steps: [
          { step: "change_need", on: "user", need: "fun", amount: 0.1 },
          { step: "wait", minutes: 1 },
          { step: "roll_hit", chance: 0.5 },
          { step: "change_need", on: "target", need: "social", amount: -0.1 },
          {
            step: "change_need",
            on: "user",
            need: "energy",
            amount: -0.1,
            evenOnMiss: true,
            chance: 0.5,
          },
          { step: "change_need", on: "user", need: "hunger", amount: -0.1, evenOnMiss: true },
        ],
        phrases: { hit: "shoved {target}", missed: "tried to shove {target}" },
      },
    ]);
    const before = { mara: sim.agent("mara").needs, tobias: sim.agent("tobias").needs };
    replaceAgent(sim.state, { ...sim.agent("mara"), needs: { ...before.mara, fun: 0.5 } });
    fixRolls(sim, ALWAYS_MISS);
    aim(sim, "mara", { verb: "shove", targetName: "Tobias" });
    expect(sim.agent("mara").needs.fun).toBeCloseTo(0.6, 9);
    finish(sim, "mara");
    expect(sim.agent("tobias").needs.social).toBe(before.tobias.social);
    expect(sim.agent("mara").needs.energy).toBe(before.mara.energy);
    expect(sim.agent("mara").needs.hunger).toBeCloseTo(before.mara.hunger - 0.1, 9);
  });
});

describe("resolving a target", () => {
  it("fails a target the verb's matcher doesn't accept", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    handOver(sim, "mara", "knife");
    aim(sim, "mara", { verb: "attack", itemName: "knife", targetName: "yourself" });
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to attack yourself with a knife but I can't attack myself",
    );
    setAgentHealth(sim, "tobias", 0);
    aim(sim, "mara", { verb: "attack", itemName: "knife", targetName: "Tobias" });
    expect(lastFailure(sim, "mara")).toContain("but that doesn't work on Tobias");
    expect(readHealth(sim, "tobias")).toBe(0);
  });

  it("aims at oneself when no target is named and the verb fits the user's own body", () => {
    const sim = buildCombatSim(["mara"]);
    setAgentHealth(sim, "mara", 0.5);
    handOver(sim, "mara", "bandage");
    aim(sim, "mara", { verb: "use", itemName: "bandage" });
    finish(sim, "mara");
    expect(readHealth(sim, "mara")).toBeCloseTo(0.65, 9);
  });

  it("asks who to aim at when no target is named and the user's own body doesn't fit", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    aim(sim, "mara", { verb: "punch" });
    expect(lastFailure(sim, "mara")).toBe("I tried to punch but I didn't say who or what to punch");
  });

  it("uses the first verb of that name in file order that applies", () => {
    const sim = buildCombatSim(["mara"]);
    addVerbs(sim, [
      {
        name: "eat",
        appliesTo: { allOf: [{ definition: "bread" }, { where: "held" }] },
        steps: [{ step: "destroy", on: "item" }],
        phrases: { done: "gobbled {item}" },
      },
    ]);
    handOver(sim, "mara", "bread");
    const fastEat = sim.state.items.verbs.length - 1;
    expect(sim.state.items.verbs[fastEat]?.name).toBe("eat");
    aim(sim, "mara", { verb: "eat", itemName: "bread" });
    expect(sim.agent("mara").currentAction?.verb).toBe("eat");
  });
});

describe("combat in decisions", () => {
  it("lists bare-handed verbs and shows a carried knife to others", async () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    handOver(sim, "mara", "knife");
    await sim.advance();
    const prompt = buildDecisionPrompt(buildDecisionContext(sim.state, "tobias", false));
    expect(prompt).toContain("You can also: punch.");
    expect(prompt).toMatch(/Mara, carrying [^(]*a knife/);
  });

  it("plans a stab from a reply naming the knife and the target", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "tobias"],
      responder: scriptByAgent({
        Mara: () =>
          decisionReply({ action: "interact", item: "knife", target: "Tobias", verb: "attack" }),
      }),
    });
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    handOver(sim, "mara", "knife");
    await sim.advance();
    expect(sim.agent("mara").currentAction?.verb).toBe("attack");
  });
});
