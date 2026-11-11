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
    replaceAgent(sim.state, { ...sim.agent("mara"), health: 0.5 });
    const bandage = handOver(sim, "mara", "bandage");
    aimWith(sim, "mara", bandage, "use", "yourself");
    finish(sim, "mara");
    expect(sim.agent("mara").health).toBeCloseTo(0.65, 9);
    expect(countHeld(sim.state, "mara", "bandage")).toBe(0);
    expect(memoryTexts(sim, "mara")).toContain("I finished bandaging myself with a bandage");
  });

  it("refuses to aim a verb at oneself when it can't be", () => {
    const sim = buildCombatSim(["mara"]);
    aim(sim, "mara", { kind: "user" }, { verb: "punch" }, "yourself");
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
    aim(sim, "mara", { kind: "user" }, { verb: "punch" }, "Tobias");
    sim.placeAgent("tobias", FAR_OUT_OF_SIGHT);
    finish(sim, "mara");
    expect(lastFailure(sim, "mara")).toBe("I tried to punch Tobias but Tobias was already gone");
    expect(sim.agent("tobias").health).toBe(1);
  });

  it("misses a target who stepped out of reach during the swing", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    fixRolls(sim, 0);
    aim(sim, "mara", { kind: "user" }, { verb: "punch" }, "Tobias");
    sim.placeAgent("tobias", FOUR_TILES_AWAY);
    const finished = finish(sim, "mara");
    expect(finished.result.events.at(-1)?.kind).toBe("missed");
    expect(sim.agent("tobias").health).toBe(1);
  });

  it("walks to a target out of reach, then strikes", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: FOUR_TILES_AWAY });
    aim(sim, "mara", { kind: "user" }, { verb: "punch" }, "Tobias");
    expect(sim.agent("mara").currentAction?.kind).toBe("walk_to");
    walkTicks(sim, "mara", 4);
    expect(sim.agent("mara").currentAction?.verb).toBe("punch");
  });

  it("gives up on a target who keeps moving away", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: FOUR_TILES_AWAY });
    aim(sim, "mara", { kind: "user" }, { verb: "punch" }, "Tobias");
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

describe("verb fields and effect modifiers", () => {
  it("needs its tools held", () => {
    const sim = buildCombatSim(["mara"]);
    addVerbs(sim, [
      {
        name: "whittle",
        appliesTo: { allOf: [{ definition: "wood" }, { location: "held" }] },
        tools: { properties: ["sharp"] },
        effects: [{ type: "change_need", on: "user", need: "fun", amount: 0.1 }],
      },
    ]);
    const wood = handOver(sim, "mara", "wood");
    aimWith(sim, "mara", wood, "whittle");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to whittle the wood but I need something sharp to do that",
    );
    handOver(sim, "mara", "knife");
    aimWith(sim, "mara", wood, "whittle");
    expect(sim.agent("mara").currentAction?.verb).toBe("whittle");
  });

  it("runs start effects at once, skips hit-only effects on a miss and rolls chance", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    addVerbs(sim, [
      {
        name: "shove",
        appliesTo: { isUser: true },
        target: "agent",
        hitRoll: { baseHitChance: 0.5 },
        effects: [
          { type: "change_need", on: "user", need: "fun", amount: 0.1, when: "start" },
          { type: "change_need", on: "target", need: "social", amount: -0.1 },
          {
            type: "change_need",
            on: "user",
            need: "energy",
            amount: -0.1,
            requiresHit: false,
            chance: 0.5,
          },
          { type: "change_need", on: "user", need: "hunger", amount: -0.1, requiresHit: false },
        ],
        phrases: { hit: "shoved {target}", missed: "tried to shove {target}" },
      },
    ]);
    const before = { mara: sim.agent("mara").needs, tobias: sim.agent("tobias").needs };
    replaceAgent(sim.state, { ...sim.agent("mara"), needs: { ...before.mara, fun: 0.5 } });
    fixRolls(sim, ALWAYS_MISS);
    aim(sim, "mara", { kind: "user" }, { verb: "shove" }, "Tobias");
    expect(sim.agent("mara").needs.fun).toBeCloseTo(0.6, 9);
    finish(sim, "mara");
    expect(sim.agent("tobias").needs.social).toBe(before.tobias.social);
    expect(sim.agent("mara").needs.energy).toBe(before.mara.energy);
    expect(sim.agent("mara").needs.hunger).toBeCloseTo(before.mara.hunger - 0.1, 9);
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
