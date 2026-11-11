import { buildItemCatalog, parseItemFile, type Position } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createEntity, findEntityIfPresent, locateInside } from "../items/entity-store";
import { readComponents, readThingChanges, type ThingRef } from "../items/things";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  buildCombatSim,
  contextOf,
  fixRolls,
  place,
  setAgentHealth,
} from "./combat-test-kit";
import { advanceConditions, startCondition } from "./conditions";
import type { EffectRun } from "./effects/effect-run";
import { sendStimulus } from "./effects/stimulus";
import type { TestSim } from "./test-sim";
import type { TickContext } from "./tick-context";

const ALWAYS = 0;
const NEVER = 0.99;
/** Away from the square's bench, board and the agents. */
const OPEN_GROUND = { x: 23, y: 19 };
const NEXT_TO_OPEN_GROUND = { x: 24, y: 19 };
const TWO_FROM_OPEN_GROUND = { x: 25, y: 19 };

function setUp(roll = ALWAYS): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  fixRolls(sim, roll);
  return sim;
}

function placeThing(sim: TestSim, definitionId: string, pos: Position): ThingRef {
  const place = sim.agent("mara").place;
  const entity = createEntity(sim.state, definitionId, { kind: "tile", place, pos });
  return { kind: "entity", entityId: entity.id };
}

function conditionsOf(sim: TestSim, subject: ThingRef): string[] {
  const components = readComponents(sim.state, subject) ?? {};
  return Object.keys(components).filter((name) => sim.state.items.conditionsByName.has(name));
}

/** Sends a stimulus as one of Mara's verbs would. */
function stimulate(sim: TestSim, receiver: ThingRef, stimulus: string): TickContext {
  const context = contextOf(sim);
  const effectRun: EffectRun = {
    context,
    verb: null,
    run: null,
    text: "",
    sourceAgentId: "mara",
    reactionDepth: 0,
  };
  sendStimulus(effectRun, receiver, stimulus);
  return context;
}

function addReactions(sim: TestSim, reactions: unknown[]): void {
  const file = sim.state.items.file;
  sim.state.items = buildItemCatalog(
    parseItemFile({ ...file, reactions: [...file.reactions, ...reactions] }),
  );
}

function definitionOf(sim: TestSim, subject: ThingRef): string | undefined {
  if (subject.kind !== "entity") return undefined;
  return findEntityIfPresent(sim.state, subject.entityId)?.definitionId;
}

describe("reactions", () => {
  it("sets a flammable thing alight when fire reaches it", () => {
    const sim = setUp();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    stimulate(sim, bench, "fire");
    expect(conditionsOf(sim, bench)).toEqual(["burning"]);
  });

  it("ignores a stimulus nothing reacts to", () => {
    const sim = setUp();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const context = stimulate(sim, jar, "fire");
    expect(conditionsOf(sim, jar)).toEqual([]);
    expect(context.result.events).toEqual([]);
  });

  it("dries a wet thing instead of lighting it, judging unless as it was when the fire arrived", () => {
    const sim = setUp();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    startCondition(contextOf(sim), bench, "wet", { sourceAgentId: null });
    stimulate(sim, bench, "fire");
    expect(conditionsOf(sim, bench)).toEqual([]);
  });

  it("puts out a burning thing with water", () => {
    const sim = setUp();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    stimulate(sim, bench, "fire");
    stimulate(sim, bench, "water");
    expect(conditionsOf(sim, bench)).toEqual([]);
  });

  it("shatters a fragile thing hit by something, with a crash others can hear", () => {
    const sim = setUp();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const context = stimulate(sim, jar, "impact");
    expect(definitionOf(sim, jar)).toBe("shards");
    const kinds = context.result.events.map((event) => [event.kind, event.loudness]);
    expect(kinds).toEqual([
      ["sound", 10],
      ["broke", null],
    ]);
    expect(context.result.events[1]?.actorName).toBe("the jar");
  });

  it("runs every matching reaction in file order", () => {
    const sim = setUp();
    addReactions(sim, [
      {
        stimulus: "poke",
        if: { has: "flesh" },
        effects: [{ type: "add_condition", condition: "poisoned" }],
      },
      {
        stimulus: "poke",
        if: { has: "flesh" },
        effects: [{ type: "remove_condition", condition: "poisoned" }],
      },
    ]);
    stimulate(sim, { kind: "agent", agentId: "tobias" }, "poke");
    expect(conditionsOf(sim, { kind: "agent", agentId: "tobias" })).toEqual([]);
  });

  it("spreads fire from a burning fragile thing that is hit, before it shatters", () => {
    const sim = setUp();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const bench = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    const farBench = placeThing(sim, "bench", TWO_FROM_OPEN_GROUND);
    startCondition(contextOf(sim), jar, "burning", { sourceAgentId: null });
    stimulate(sim, jar, "impact");
    expect(definitionOf(sim, jar)).toBe("shards");
    expect(conditionsOf(sim, bench)).toEqual(["burning"]);
    expect(conditionsOf(sim, farBench)).toEqual([]);
  });

  it("carries the agent who started a chain to every condition it causes", () => {
    const sim = setUp();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    const bench = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    startCondition(contextOf(sim), jar, "burning", { sourceAgentId: null });
    stimulate(sim, jar, "impact");
    expect(readThingChanges(sim.state, bench)?.burning?.sourceAgentId).toBe("mara");
  });

  it("stops a chain at the depth cap and reports it", () => {
    const sim = setUp();
    addReactions(sim, [
      { stimulus: "echo", if: { has: "flesh" }, effects: [{ type: "emit", stimulus: "echo" }] },
    ]);
    const context = stimulate(sim, { kind: "agent", agentId: "tobias" }, "echo");
    expect(context.result.reactionCapHits).toHaveLength(1);
    expect(context.result.reactionCapHits[0]).toContain(
      `depth cap of ${config.reactions.maxDepth}`,
    );
  });

  it("burns bodies too, since the dead keep the person components", () => {
    const sim = setUp();
    const tobias: ThingRef = { kind: "agent", agentId: "tobias" };
    setAgentHealth(sim, "tobias", 0);
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "tobias"
        ? { ...agent, death: { tick: 0, cause: "x", sourceAgentId: null } }
        : agent,
    );
    const context = stimulate(sim, tobias, "fire");
    expect(conditionsOf(sim, tobias)).toEqual(["burning"]);
    expect(context.result.events[0]?.actorName).toBe("Tobias's body");
  });
});

describe("nearby", () => {
  it("reaches things within the radius and not beyond", () => {
    const sim = setUp();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const near = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    const far = placeThing(sim, "bench", TWO_FROM_OPEN_GROUND);
    startCondition(contextOf(sim), bench, "burning", { sourceAgentId: "mara" });
    sim.state.tick += 1;
    advanceConditions(contextOf(sim));
    expect(conditionsOf(sim, near)).toEqual(["burning"]);
    expect(conditionsOf(sim, far)).toEqual([]);
  });

  it("finds a held thing where its holder is, so a burning thing in hand sets its holder alight", () => {
    const sim = setUp();
    const held = createEntity(sim.state, "bread", locateInside("tobias"));
    startCondition(contextOf(sim), { kind: "entity", entityId: held.id }, "burning", {
      sourceAgentId: "mara",
    });
    sim.state.tick += 1;
    advanceConditions(contextOf(sim));
    expect(conditionsOf(sim, { kind: "agent", agentId: "tobias" })).toEqual(["burning"]);
    expect(sim.agent("tobias").bodyChanges.burning?.sourceAgentId).toBe("mara");
  });

  it("leaves things alone when the spread's chance fails", () => {
    const sim = setUp(NEVER);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const near = placeThing(sim, "bench", NEXT_TO_OPEN_GROUND);
    startCondition(contextOf(sim), bench, "burning", { sourceAgentId: null });
    sim.state.tick += 1;
    advanceConditions(contextOf(sim));
    expect(conditionsOf(sim, near)).toEqual([]);
  });
});
