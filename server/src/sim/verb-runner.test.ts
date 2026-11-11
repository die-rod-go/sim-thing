import { describe, expect, it } from "vitest";
import type { Entity, EntityLocation } from "@village/shared";
import {
  countHeld,
  createEntity,
  findEntity,
  listContents,
  replaceEntity,
} from "../items/entity-store";
import { readField } from "../items/things";
import { tileIndex } from "../world/types";
import { cancelRunningVerb, startVerbNow } from "./verb-runner";
import { getAgentRuntime } from "./agent-runtime";
import { wakeAgent } from "./action-stopping";
import {
  contextOf,
  entityThing,
  finish,
  handOver,
  lastFailure,
  readFieldOf,
  setField,
} from "./combat-test-kit";
import { createTestSim, findEntityByLabel, scriptByAgent, type TestSim } from "./test-sim";
import type { TickContext } from "./tick-context";
import { buildPerceptionWorld } from "./world-access";

const NEXT_TO_FIELD = { x: 8, y: 23 };
const NEXT_TO_TABLE = { x: 31, y: 13 };
const OTHER_SIDE_OF_TABLE = { x: 31, y: 15 };
const NEXT_TO_BOARD = { x: 18, y: 13 };
const IN_ROSE_COTTAGE = { x: 3, y: 4 };
const IN_BAKERY = { x: 6, y: 12 };

function buildSim(agentIds = ["mara"]): TestSim {
  return createTestSim({ agentIds, responder: scriptByAgent({}) });
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

describe("verb effects", () => {
  it("takes stock when harvesting starts and produces wheat when it finishes", () => {
    const sim = buildSim();
    sim.placeAgent("mara", NEXT_TO_FIELD);
    const field = findEntityByLabel(sim.state, "wheat field");
    const wheatBefore = countHeld(sim.state, "mara", "wheat");
    const energyBefore = sim.agent("mara").needs.energy;
    startOn(sim, "mara", field, "harvest wheat");
    expect(readFieldOf(sim, entityThing(field), "stock.amount")).toBe(9);
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
    setField(sim, entityThing(field), "stock.amount", 2);
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
    const funBefore = sim.agent("mara").needs.fun;
    finish(sim, "mara");
    expect(sim.agent("mara").needs.fun).toBeCloseTo(Math.min(1, funBefore + 0.2 + 0.1), 9);
    expect(getAgentRuntime(sim.state, "mara").verbRun).toBeNull();
    expect(getAgentRuntime(sim.state, "ilsa").verbRun?.usedEntityId).toBe(table.id);
  });

  it("closes a door so it blocks sight, and offers no second closing", () => {
    const sim = buildSim();
    sim.placeAgent("mara", IN_BAKERY);
    const door = findEntityByLabel(sim.state, "bakery door");
    startOn(sim, "mara", door, "close");
    expect(readFieldOf(sim, entityThing(door), "health.current")).toBe(5);
    expect(Object.hasOwn(findEntity(sim.state, door.id).changes, "closed")).toBe(true);
    const doorPos = door.location.kind === "tile" ? door.location.pos : { x: -1, y: -1 };
    const world = buildPerceptionWorld(sim.state);
    expect(world.sightBlockingTiles.has(tileIndex(world.grid, doorPos))).toBe(true);
    finish(sim, "mara");
    startOn(sim, "mara", door, "close");
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to close the bakery door but the bakery door doesn't do 'close'",
    );
  });

  it("puts the agent to sleep in the bed and ends the verb run on waking", () => {
    const sim = buildSim();
    sim.placeAgent("mara", IN_ROSE_COTTAGE);
    const bed = findEntityByLabel(sim.state, "rose cottage bed");
    const started = startOn(sim, "mara", bed, "sleep", { minutes: 30 });
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "sleep", endsAtTick: 30 });
    expect(getAgentRuntime(sim.state, "mara").verbRun?.usedEntityId).toBe(bed.id);
    expect(started.result.events.map((event) => event.kind)).toEqual(["fell_asleep"]);
    wakeAgent(contextOf(sim), "mara");
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(getAgentRuntime(sim.state, "mara").verbRun).toBeNull();
  });

  it("needs words to post a note, and reading files the notes as memories", () => {
    const sim = buildSim(["mara", "ilsa"]);
    sim.placeAgent("mara", NEXT_TO_BOARD);
    sim.placeAgent("ilsa", NEXT_TO_BOARD);
    const board = findEntityByLabel(sim.state, "notice board");
    startOn(sim, "mara", board, "post a note");
    expect(lastFailure(sim, "mara")).toContain("I need to write something");
    startOn(sim, "mara", board, "post a note", { text: "Fresh bread, 2 coins" });
    const notes = listContents(sim.state, board.id);
    expect(
      notes.map((note) =>
        readField(sim.state, { kind: "entity", entityId: note.id }, "writing.text"),
      ),
    ).toEqual(["Fresh bread, 2 coins"]);
    startOn(sim, "ilsa", board, "read");
    const texts = sim.state.memoryStore.listByAgent("ilsa").map((memory) => memory.text);
    expect(texts).toContain('I read a note from Mara on the notice board: "Fresh bread, 2 coins"');
  });
});

describe("two agents reaching for the same thing", () => {
  function dropBread(sim: TestSim): Entity {
    const ground: EntityLocation = { kind: "tile", place: "town square", pos: { x: 19, y: 15 } };
    return createEntity(sim.state, "bread", ground);
  }

  it("gives it to the first and fails the second with a reason", () => {
    const sim = buildSim(["mara", "ilsa"]);
    sim.placeAgent("mara", { x: 18, y: 15 });
    sim.placeAgent("ilsa", { x: 20, y: 15 });
    const bread = dropBread(sim);
    startOn(sim, "mara", bread, "pick up");
    startOn(sim, "ilsa", bread, "pick up");
    finish(sim, "mara");
    expect(findEntity(sim.state, bread.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    finish(sim, "ilsa");
    expect(findEntity(sim.state, bread.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    expect(lastFailure(sim, "ilsa")).toBe(
      "I tried to pick up the bread but someone got to it first",
    );
  });

  it("refuses to start on something another agent already holds", () => {
    const sim = buildSim(["mara", "ilsa"]);
    sim.placeAgent("ilsa", { x: 20, y: 15 });
    const bread = dropBread(sim);
    replaceEntity(sim.state, { ...bread, location: { kind: "inside", holderId: "mara" } });
    startOn(sim, "ilsa", bread, "pick up");
    expect(lastFailure(sim, "ilsa")).toBe(
      "I tried to pick up the bread but someone got to it first",
    );
  });
});
