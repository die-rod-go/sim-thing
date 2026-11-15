import type { Position, WorldEvent } from "@village/shared";
import { describe, expect, it } from "vitest";
import { computeChebyshevDistance } from "../economy/give";
import { findEntityIfPresent } from "../items/entity-store";

import { config } from "../config";
import { getAgentRuntime, simRuntimeSchema } from "./agent-runtime";
import {
  aim,
  contextOf,
  entityThing,
  finish,
  fixRolls,
  readFieldOf,
  setAgentHealth,
  setField,
} from "./combat-test-kit";
import {
  FIELD_EDGE,
  WOLF_STATS,
  actForTicks,
  buildCreatureSim,
  placeCreature,
} from "./creature-test-kit";
import { updateSight } from "./tick-phases";
import { readUserStats } from "./verb-user";
import type { TestSim } from "./test-sim";
import { createDefaultSettings, toSavedWorld, type TickResult } from "./world-state";

const ALWAYS = 0;
const NEVER = 0.99;

function positionOf(sim: TestSim, entityId: string): Position {
  const entity = findEntityIfPresent(sim.state, entityId);
  if (entity?.location.kind !== "tile") throw new Error(`${entityId} is not on a tile`);
  return entity.location.pos;
}

function nearestPersonDistance(sim: TestSim, pos: Position): number {
  return Math.min(...sim.state.agents.map((agent) => computeChebyshevDistance(agent.pos, pos)));
}

function listEvents(results: readonly TickResult[], kind: WorldEvent["kind"]): WorldEvent[] {
  return results.flatMap((result) => result.events).filter((event) => event.kind === kind);
}

describe("creature instincts", () => {
  it("wanders a tile when its wander roll comes up", () => {
    const sim = buildCreatureSim(ALWAYS);
    const boar = placeCreature(sim, "boar", FIELD_EDGE);
    actForTicks(sim, 1);
    expect(computeChebyshevDistance(positionOf(sim, boar.id), FIELD_EDGE)).toBe(1);
  });

  it("stays put when its wander roll fails", () => {
    const sim = buildCreatureSim(NEVER);
    const boar = placeCreature(sim, "boar", FIELD_EDGE);
    actForTicks(sim, 3);
    expect(positionOf(sim, boar.id)).toEqual(FIELD_EDGE);
  });

  it("runs from a person within its radius", () => {
    const sim = buildCreatureSim(NEVER);
    const deer = placeCreature(sim, "deer", { x: 22, y: 15 });
    const before = nearestPersonDistance(sim, positionOf(sim, deer.id));
    actForTicks(sim, 1);
    expect(nearestPersonDistance(sim, positionOf(sim, deer.id))).toBeGreaterThan(before);
  });

  it("walks up to a person it hunts and bites them, which they and onlookers remember", () => {
    const sim = buildCreatureSim(ALWAYS);
    placeCreature(sim, "wolf", FIELD_EDGE);
    const [bite] = listEvents(actForTicks(sim, 10), "attacked");
    expect(bite?.actorName).toBe("the wolf");
    const victimId = bite?.targetId ?? "";
    const onlookerId = victimId === "mara" ? "tobias" : "mara";
    expect(sim.streamTexts(victimId)).toContain("The wolf bit me");
    expect(sim.streamTexts(onlookerId)).toContain(
      `I saw that the wolf bit ${sim.agent(victimId).name}`,
    );
  });

  it("strikes back only at whoever attacked it", () => {
    const sim = buildCreatureSim(NEVER);
    placeCreature(sim, "boar", { x: 19, y: 16 });
    expect(listEvents(actForTicks(sim, 3), "attacked")).toEqual([]);
    aim(sim, "mara", { verb: "punch", targetName: "boar" });
    finish(sim, "mara");
    fixRolls(sim, ALWAYS);
    const bites = listEvents(actForTicks(sim, 4), "attacked");
    expect(bites.length).toBeGreaterThan(0);
    expect(bites.every((bite) => bite.targetId === "mara")).toBe(true);
  });

  it("grazes a crop once, then leaves it alone while sated", () => {
    const sim = buildCreatureSim(NEVER);
    const field = placeCreature(sim, "wheat_field", FIELD_EDGE);
    placeCreature(sim, "deer", { x: 24, y: 19 });
    const before = Number(readFieldOf(sim, entityThing(field), "stock.amount"));
    actForTicks(sim, 6);
    expect(readFieldOf(sim, entityThing(field), "stock.amount")).toBe(before - 1);
  });

  it("drops what it leaves behind and is gone when it dies", () => {
    const sim = buildCreatureSim(NEVER);
    const wolf = placeCreature(sim, "wolf", FIELD_EDGE);
    setField(sim, entityThing(wolf), "health.current", 0);
    expect(findEntityIfPresent(sim.state, wolf.id)).toBeUndefined();
    const meatHere = sim.state.entities.filter(
      (entity) =>
        entity.definitionId === "meat" &&
        entity.location.kind === "tile" &&
        computeChebyshevDistance(entity.location.pos, FIELD_EDGE) === 0,
    );
    expect(meatHere).toHaveLength(2);
  });

  it("names the creature in the cause of a death it caused", () => {
    const sim = buildCreatureSim(ALWAYS);
    setAgentHealth(sim, "mara", 0.05);
    placeCreature(sim, "wolf", { x: 18, y: 15 });
    actForTicks(sim, 3);
    expect(sim.agent("mara").death?.cause).toBe("mauled to death by the wolf");
  });

  it("keeps who attacked a creature in the save", () => {
    const sim = buildCreatureSim(NEVER);
    const boar = placeCreature(sim, "boar", { x: 19, y: 16 });
    aim(sim, "mara", { verb: "punch", targetName: "boar" });
    finish(sim, "mara");
    const saved = toSavedWorld(sim.state, createDefaultSettings());
    const runtime = simRuntimeSchema.parse(JSON.parse(JSON.stringify(saved.runtime)));
    expect(runtime.creatureRuntimes[boar.id]?.lastAttack?.attackerId).toBe("mara");
  });
});

describe("creature stats", () => {
  it("reads a creature's strength and agility from its fields, else the middling ones", () => {
    const sim = buildCreatureSim(NEVER);
    const wolf = placeCreature(sim, "wolf", FIELD_EDGE);
    const deer = placeCreature(sim, "deer", { x: 24, y: 19 });
    expect(readUserStats(sim.state, wolf.id)).toEqual(WOLF_STATS);
    expect(readUserStats(sim.state, deer.id)).toEqual(config.creatures.stats);
  });

  it("lets an agile creature dodge a blow that lands on a middling one", () => {
    const punchChance = 0.8;
    const { agilitySpread } = config.combat;
    const maraAgility = buildCreatureSim().agent("mara").body.agility;
    const againstWolf = punchChance + (maraAgility - WOLF_STATS.agility) * agilitySpread;
    const againstDeer =
      punchChance + (maraAgility - config.creatures.stats.agility) * agilitySpread;
    const roll = (againstWolf + againstDeer) / 2;
    const outcomes = ["wolf", "deer"].map((definitionId) => {
      const sim = buildCreatureSim(roll);
      placeCreature(sim, definitionId, { x: 19, y: 16 });
      aim(sim, "mara", { verb: "punch", targetName: definitionId });
      return listEvents([finish(sim, "mara").result], "attacked").length > 0;
    });
    expect(outcomes).toEqual([false, true]);
  });
});

describe("creatures coming into view", () => {
  it("gives a decision when a creature comes into view, and not again while it stays", () => {
    const sim = buildCreatureSim(NEVER);
    placeCreature(sim, "boar", FIELD_EDGE);
    updateSight(contextOf(sim));
    const runtime = getAgentRuntime(sim.state, "mara");
    expect(runtime.pendingDecision?.reason).toBe("the boar came into view");
    runtime.pendingDecision = null;
    updateSight(contextOf(sim));
    expect(runtime.pendingDecision).toBeNull();
  });
});
