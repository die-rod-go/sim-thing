import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { Entity, EntityLocation } from "@village/shared";
import { countHeld, createEntity, findEntity, replaceEntity } from "../items/entity-store";
import { tileIndex } from "../world/types";
import { cancelRunningVerb, finishRunningVerb, startVerbNow } from "./verb-runner";
import { getAgentRuntime } from "./agent-runtime";
import { wakeAgent } from "./action-stopping";
import { createNoReflectionHook } from "./reflection-hook";
import { createTestSim, findEntityByLabel, scriptByAgent, type TestSim } from "./test-sim";
import type { TickContext } from "./tick-context";
import { buildPerceptionWorld, replaceAgent } from "./world-access";
import { createEmptyTickResult } from "./world-state";

const NEXT_TO_FIELD = { x: 8, y: 23 };
const NEXT_TO_TABLE = { x: 31, y: 13 };
const OTHER_SIDE_OF_TABLE = { x: 31, y: 15 };
const NEXT_TO_BOARD = { x: 18, y: 13 };
const IN_ROSE_COTTAGE = { x: 3, y: 4 };
const IN_BAKERY = { x: 6, y: 12 };

function buildSim(agentIds = ["mara"]): TestSim {
  return createTestSim({ agentIds, responder: scriptByAgent({}) });
}

function contextOf(sim: TestSim): TickContext {
  return {
    state: sim.state,
    result: createEmptyTickResult(sim.state.tick),
    dependencies: {
      callStructured: sim.llm.callStructured,
      reflectionHook: createNoReflectionHook(),
    },
  };
}

function startOn(
  sim: TestSim,
  agentId: string,
  entity: Entity,
  verb: string,
  details: { text?: string; minutes?: number } = {},
): TickContext {
  const context = contextOf(sim);
  startVerbNow(context, agentId, { kind: "entity", entityId: entity.id }, { verb, ...details });
  return context;
}

function finish(sim: TestSim, agentId: string): TickContext {
  const context = contextOf(sim);
  finishRunningVerb(context, agentId);
  return context;
}

function handOver(sim: TestSim, agentId: string, definitionId: string): Entity {
  return createEntity(sim.state, definitionId, { kind: "inventory", agentId });
}

function lastFailure(sim: TestSim, agentId: string): string | null {
  return getAgentRuntime(sim.state, agentId).lastFailure;
}

function exhaust(sim: TestSim, agentId: string): void {
  const agent = sim.agent(agentId);
  replaceAgent(sim.state, { ...agent, needs: { ...agent.needs, energy: 0.05 } });
}

function minutesUntilDone(sim: TestSim, agentId: string): number {
  const endsAtTick = sim.agent(agentId).currentAction?.endsAtTick ?? sim.state.tick;
  return (endsAtTick - sim.state.tick) * config.clock.minutesPerTick;
}

describe("slowed by pressing needs", () => {
  it("takes longer when exhausted and tells the agent why as it starts", () => {
    const rested = buildSim();
    rested.placeAgent("mara", NEXT_TO_FIELD);
    startOn(rested, "mara", findEntityByLabel(rested.state, "wheat field"), "harvest wheat");
    const tired = buildSim();
    tired.placeAgent("mara", NEXT_TO_FIELD);
    exhaust(tired, "mara");
    startOn(tired, "mara", findEntityByLabel(tired.state, "wheat field"), "harvest wheat");
    expect(minutesUntilDone(tired, "mara")).toBeGreaterThan(minutesUntilDone(rested, "mara"));
    expect(tired.agent("mara").workingMemory.at(-1)).toContain(
      "This will take longer than usual because I'm exhausted",
    );
    expect(rested.agent("mara").workingMemory.join(" ")).not.toContain("longer than usual");
  });

  it("tells only the agent itself that it finished slowly", () => {
    const sim = buildSim();
    sim.placeAgent("mara", NEXT_TO_FIELD);
    exhaust(sim, "mara");
    startOn(sim, "mara", findEntityByLabel(sim.state, "wheat field"), "harvest wheat");
    const finishEvent = finish(sim, "mara").result.events.at(-1);
    expect(finishEvent?.description).toBe(
      "finished harvesting wheat at the wheat field, making 3 wheat",
    );
    expect(finishEvent?.actorDescription).toBe(
      "finished harvesting wheat at the wheat field, making 3 wheat, slowly, because I was exhausted",
    );
  });
});

describe("verb effects", () => {
  it("takes stock when harvesting starts and produces wheat when it finishes", () => {
    const sim = buildSim();
    sim.placeAgent("mara", NEXT_TO_FIELD);
    const field = findEntityByLabel(sim.state, "wheat field");
    const wheatBefore = countHeld(sim.state, "mara", "wheat");
    const energyBefore = sim.agent("mara").needs.energy;
    startOn(sim, "mara", field, "harvest wheat");
    expect(findEntity(sim.state, field.id).state.stock).toBe(9);
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore);
    const nextIdBefore = sim.state.nextEntityId;
    const finished = finish(sim, "mara");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore + 3);
    expect(sim.state.nextEntityId).toBe(nextIdBefore + 3);
    expect(sim.agent("mara").needs.energy).toBeCloseTo(energyBefore - 0.1, 9);
    expect(finished.result.events.at(-1)?.description).toBe(
      "finished harvesting wheat at the wheat field, making 3 wheat",
    );
  });

  it("refuses to take stock that isn't there", () => {
    const sim = buildSim();
    sim.placeAgent("mara", NEXT_TO_FIELD);
    const field = findEntityByLabel(sim.state, "wheat field");
    replaceEntity(sim.state, { ...field, state: { ...field.state, stock: 2 } });
    startOn(sim, "mara", field, "harvest wheat");
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to harvest wheat at the wheat field but the wheat field is empty",
    );
  });

  it("destroys the bread when eating starts and fills hunger when it finishes", () => {
    const sim = buildSim();
    const bread = handOver(sim, "mara", "bread");
    const breadBefore = countHeld(sim.state, "mara", "bread");
    const hungerBefore = sim.agent("mara").needs.hunger;
    const started = startOn(sim, "mara", bread, "eat");
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore - 1);
    expect(started.result.removedEntityIds).toContain(bread.id);
    expect(sim.agent("mara").needs.hunger).toBe(hungerBefore);
    finish(sim, "mara");
    expect(sim.agent("mara").needs.hunger).toBeCloseTo(Math.min(1, hungerBefore + 0.5), 9);
  });

  it("keeps what start effects did and skips finish effects when cancelled", () => {
    const sim = buildSim();
    sim.placeAgent("mara", IN_BAKERY);
    handOver(sim, "mara", "wheat");
    handOver(sim, "mara", "wheat");
    handOver(sim, "mara", "wood");
    const wheatBefore = countHeld(sim.state, "mara", "wheat");
    const breadBefore = countHeld(sim.state, "mara", "bread");
    startOn(sim, "mara", findEntityByLabel(sim.state, "oven"), "bake bread");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore - 2);
    cancelRunningVerb(contextOf(sim), "mara");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore - 2);
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore);
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("adds fun for each other player at the card table", () => {
    const sim = buildSim(["mara", "ilsa"]);
    sim.placeAgent("mara", NEXT_TO_TABLE);
    sim.placeAgent("ilsa", OTHER_SIDE_OF_TABLE);
    const table = findEntityByLabel(sim.state, "card table");
    startOn(sim, "mara", table, "play cards");
    startOn(sim, "ilsa", table, "play cards");
    expect(findEntity(sim.state, table.id).state.userIds).toEqual(["mara", "ilsa"]);
    const funBefore = sim.agent("mara").needs.fun;
    finish(sim, "mara");
    expect(sim.agent("mara").needs.fun).toBeCloseTo(Math.min(1, funBefore + 0.2 + 0.1), 9);
    expect(findEntity(sim.state, table.id).state.userIds).toEqual(["ilsa"]);
  });

  it("closes a door so it blocks sight, and refuses to close it twice", () => {
    const sim = buildSim();
    sim.placeAgent("mara", IN_BAKERY);
    const door = findEntityByLabel(sim.state, "bakery door");
    startOn(sim, "mara", door, "close");
    expect(findEntity(sim.state, door.id).state.isOpen).toBe(false);
    const doorPos = door.location.kind === "tile" ? door.location.pos : { x: -1, y: -1 };
    const world = buildPerceptionWorld(sim.state);
    expect(world.sightBlockingTiles.has(tileIndex(world.grid, doorPos))).toBe(true);
    finish(sim, "mara");
    startOn(sim, "mara", door, "close");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to close the bakery door but the bakery door is already closed",
    );
  });

  it("puts the agent to sleep in the bed and frees the bed on waking", () => {
    const sim = buildSim();
    sim.placeAgent("mara", IN_ROSE_COTTAGE);
    const bed = findEntityByLabel(sim.state, "rose cottage bed");
    const started = startOn(sim, "mara", bed, "sleep", { minutes: 30 });
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "sleep", endsAtTick: 30 });
    expect(findEntity(sim.state, bed.id).state.userIds).toEqual(["mara"]);
    expect(started.result.events.map((event) => event.kind)).toEqual(["fell_asleep"]);
    wakeAgent(contextOf(sim), "mara");
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(findEntity(sim.state, bed.id).state.userIds).toEqual([]);
  });

  it("needs words to post a note, and reading files the notes as memories", () => {
    const sim = buildSim(["mara", "ilsa"]);
    sim.placeAgent("mara", NEXT_TO_BOARD);
    sim.placeAgent("ilsa", NEXT_TO_BOARD);
    const board = findEntityByLabel(sim.state, "notice board");
    startOn(sim, "mara", board, "post a note");
    expect(lastFailure(sim, "mara")).toContain("I need to write something");
    startOn(sim, "mara", board, "post a note", { text: "Fresh bread, 2 coins" });
    expect(findEntity(sim.state, board.id).state.notes?.map((note) => note.text)).toEqual([
      "Fresh bread, 2 coins",
    ]);
    startOn(sim, "ilsa", board, "read");
    const texts = sim.state.memoryStore.listByAgent("ilsa").map((memory) => memory.text);
    expect(texts).toContain('I read a note from Mara on the notice board: "Fresh bread, 2 coins"');
  });
});

describe("two agents reaching for the same thing", () => {
  function addPickUp(sim: TestSim): void {
    const file = sim.state.items.file;
    const pickUp = {
      name: "pick up",
      appliesTo: { allOf: [{ form: "carriable" as const }, { location: "ground" as const }] },
      target: "none" as const,
      canTargetSelf: false,
      reach: 1,
      minutes: 1,
      loudness: null,
      takesText: false,
      inputs: {},
      effects: [{ type: "move" as const, on: "item" as const, to: "user" as const }],
      phrases: { attempt: "pick up the {item}" },
    };
    sim.state.items = { ...sim.state.items, verbs: [...file.verbs, pickUp] };
  }

  function dropBread(sim: TestSim): Entity {
    const ground: EntityLocation = { kind: "tile", place: "town square", pos: { x: 19, y: 15 } };
    return createEntity(sim.state, "bread", ground);
  }

  it("gives it to the first and fails the second with a reason", () => {
    const sim = buildSim(["mara", "ilsa"]);
    addPickUp(sim);
    sim.placeAgent("mara", { x: 18, y: 15 });
    sim.placeAgent("ilsa", { x: 20, y: 15 });
    const bread = dropBread(sim);
    startOn(sim, "mara", bread, "pick up");
    startOn(sim, "ilsa", bread, "pick up");
    finish(sim, "mara");
    expect(findEntity(sim.state, bread.id).location).toEqual({
      kind: "inventory",
      agentId: "mara",
    });
    finish(sim, "ilsa");
    expect(findEntity(sim.state, bread.id).location).toEqual({
      kind: "inventory",
      agentId: "mara",
    });
    expect(lastFailure(sim, "ilsa")).toBe(
      "I tried to pick up the bread but someone got to it first",
    );
  });

  it("refuses to start on something another agent already holds", () => {
    const sim = buildSim(["mara", "ilsa"]);
    addPickUp(sim);
    sim.placeAgent("ilsa", { x: 20, y: 15 });
    const bread = dropBread(sim);
    replaceEntity(sim.state, { ...bread, location: { kind: "inventory", agentId: "mara" } });
    startOn(sim, "ilsa", bread, "pick up");
    expect(lastFailure(sim, "ilsa")).toBe(
      "I tried to pick up the bread but someone got to it first",
    );
  });
});
