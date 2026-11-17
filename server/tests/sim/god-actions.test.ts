import { describe, expect, it } from "vitest";
import {
  createEntity,
  findEntity,
  findEntityIfPresent,
  locateInside,
} from "../../src/items/entity-store";
import { config } from "../../src/config";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import {
  BESIDE_SQUARE,
  buildCombatSim,
  contextOf,
  killAgent,
  memoryTexts,
  NEXT_TO_SQUARE,
  place,
  SQUARE,
} from "./combat-test-kit";
import { applyGodAction } from "../../src/sim/god-actions";

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
      isReckoning: true,
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

describe("god mode: speaking from the sky", () => {
  it("is heard word for word by everyone alive, however far apart, who decide at once", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: COTTAGE });
    const refusal = applyGodAction(contextOf(sim), { kind: "speak", words: "  Repent!  " });
    expect(refusal).toBeNull();
    for (const agentId of ["mara", "tobias"]) {
      expect(memoryTexts(sim, agentId)).toContain('A booming voice from the sky said: "Repent!"');
      expect(getAgentRuntime(sim.state, agentId).pendingDecision).toEqual({
        reason: 'a booming voice from the sky said: "Repent!"',
        isUrgent: true,
        isReckoning: true,
      });
    }
  });

  it("is heard whole, however long, where an ordinary stream entry would be cut", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: COTTAGE });
    const words = "Prepare. ".repeat(config.memory.streamEntryMaxChars / 4).trim();
    applyGodAction(contextOf(sim), { kind: "speak", words });
    expect(memoryTexts(sim, "mara")).toContain(`A booming voice from the sky said: "${words}"`);
  });

  it("makes everyone alive reckon with it, and take stock afterwards", async () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: COTTAGE });
    applyGodAction(contextOf(sim), { kind: "speak", words: "Goblins are coming" });
    sim.records.length = 0;
    await sim.advance();
    const decisionKinds = sim.records
      .filter((record) => record.kind === "decision" || record.kind === "reckoning")
      .map((record) => record.kind);
    expect(decisionKinds).toEqual(["reckoning", "reckoning"]);
    expect(sim.records.find((record) => record.kind === "reckoning")?.prompt).toContain(
      "## Something has happened",
    );
    expect(sim.records.map((record) => record.kind)).toContain("long_term_goals");
  });

  it("is not heard by the dead", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    killAgent(sim, "tobias");
    const before = memoryTexts(sim, "tobias");
    applyGodAction(contextOf(sim), { kind: "speak", words: "Hello" });
    expect(memoryTexts(sim, "tobias")).toEqual(before);
  });

  it("refuses to say nothing", () => {
    const sim = buildCombatSim();
    const refusal = applyGodAction(contextOf(sim), { kind: "speak", words: "   " });
    expect(refusal).not.toBeNull();
    expect(getAgentRuntime(sim.state, "mara").pendingDecision).toBeNull();
  });
});
