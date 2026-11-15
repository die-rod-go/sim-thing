import { describe, expect, it } from "vitest";
import { createEntity, findEntity, findEntityIfPresent, locateInside } from "../items/entity-store";
import { getAgentRuntime } from "./agent-runtime";
import {
  BESIDE_SQUARE,
  buildCombatSim,
  contextOf,
  memoryTexts,
  NEXT_TO_SQUARE,
  place,
  SQUARE,
} from "./combat-test-kit";
import { applyGodAction } from "./god-actions";

/** Mara's cottage, out of sight of the town square. */
const COTTAGE = { x: 5, y: 4 };

describe("god mode: moving people", () => {
  it("moves a person, who finds themselves elsewhere and decides at once", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const context = contextOf(sim);
    const refusal = applyGodAction(context, { kind: "move_agent", agentId: "mara", pos: COTTAGE });
    expect(refusal).toBeNull();
    expect(sim.agent("mara").pos).toEqual(COTTAGE);
    expect(context.result.moves).toEqual([
      { agentId: "mara", pos: COTTAGE, place: sim.agent("mara").place },
    ]);
    const maraTexts = memoryTexts(sim, "mara");
    expect(maraTexts.some((text) => text.startsWith("I suddenly found myself in"))).toBe(true);
    expect(maraTexts.some((text) => text.includes("vanished"))).toBe(false);
    expect(memoryTexts(sim, "tobias")).toContain("I saw that Mara vanished into thin air");
    expect(getAgentRuntime(sim.state, "mara").pendingDecision).toEqual({
      reason: "I suddenly found myself somewhere else",
      isUrgent: true,
    });
  });

  it("ends the walk the moved person was on", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    getAgentRuntime(sim.state, "mara").walk = {
      destination: { kind: "agent", agentId: "tobias" },
      remainingSteps: [BESIDE_SQUARE],
      pendingVerb: null,
    };
    applyGodAction(contextOf(sim), { kind: "move_agent", agentId: "mara", pos: COTTAGE });
    expect(getAgentRuntime(sim.state, "mara").walk).toBeNull();
  });

  it("refuses to drop a person onto someone else", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const refusal = applyGodAction(contextOf(sim), {
      kind: "move_agent",
      agentId: "mara",
      pos: NEXT_TO_SQUARE,
    });
    expect(refusal).not.toBeNull();
    expect(sim.agent("mara").pos).toEqual(SQUARE);
  });
});

describe("god mode: entities", () => {
  it("places an item on a tile, seen appearing by those nearby", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const context = contextOf(sim);
    const refusal = applyGodAction(context, {
      kind: "place_entity",
      definitionId: "knife",
      destination: { kind: "tile", pos: BESIDE_SQUARE },
    });
    expect(refusal).toBeNull();
    const [knifeId] = context.result.changedEntityIds;
    if (knifeId === undefined) throw new Error("the knife was made");
    expect(findEntity(sim.state, knifeId).location).toMatchObject({ pos: BESIDE_SQUARE });
    expect(memoryTexts(sim, "mara").some((text) => text.includes("appeared out of thin air"))).toBe(
      true,
    );
  });

  it("puts a placed item into a person's hands, who files it as their own", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const context = contextOf(sim);
    applyGodAction(context, {
      kind: "place_entity",
      definitionId: "knife",
      destination: { kind: "agent", agentId: "mara" },
    });
    const [knifeId] = context.result.changedEntityIds;
    if (knifeId === undefined) throw new Error("the knife was made");
    expect(findEntity(sim.state, knifeId).location).toEqual(locateInside("mara"));
    expect(memoryTexts(sim, "mara")).toContain("My knife appeared out of thin air");
    expect(memoryTexts(sim, "tobias")).toContain(
      "I saw that Mara's knife appeared out of thin air",
    );
  });

  it("refuses an unknown definition and a wall", () => {
    const sim = buildCombatSim();
    const context = contextOf(sim);
    const unknown = applyGodAction(context, {
      kind: "place_entity",
      definitionId: "dragon",
      destination: { kind: "tile", pos: SQUARE },
    });
    const offMap = applyGodAction(context, {
      kind: "place_entity",
      definitionId: "knife",
      destination: { kind: "tile", pos: { x: -1, y: 0 } },
    });
    expect(unknown).not.toBeNull();
    expect(offMap).not.toBeNull();
    expect(context.result.changedEntityIds).toEqual([]);
  });

  it("moves a ground item to another tile", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const knife = createEntity(sim.state, "knife", {
      kind: "tile",
      place: "town square",
      pos: SQUARE,
    });
    applyGodAction(contextOf(sim), {
      kind: "move_entity",
      entityId: knife.id,
      destination: { kind: "tile", pos: COTTAGE },
    });
    expect(findEntity(sim.state, knife.id).location).toMatchObject({ pos: COTTAGE });
    expect(memoryTexts(sim, "tobias").some((text) => text.includes("vanished into thin air"))).toBe(
      true,
    );
  });

  it("deletes an entity along with what it holds", () => {
    const sim = buildCombatSim();
    const chest = createEntity(sim.state, "chest", {
      kind: "tile",
      place: "town square",
      pos: BESIDE_SQUARE,
    });
    const knife = createEntity(sim.state, "knife", locateInside(chest.id));
    const context = contextOf(sim);
    applyGodAction(context, { kind: "delete_entity", entityId: chest.id });
    expect(findEntityIfPresent(sim.state, chest.id)).toBeUndefined();
    expect(findEntityIfPresent(sim.state, knife.id)).toBeUndefined();
    expect(context.result.removedEntityIds).toEqual([chest.id, knife.id]);
  });
});
