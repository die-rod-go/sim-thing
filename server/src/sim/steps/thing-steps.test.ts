import { describe, expect, it } from "vitest";
import { computeChebyshevDistance } from "../../economy/give";
import {
  createEntity,
  findEntityIfPresent,
  listContents,
  locateInside,
} from "../../items/entity-store";
import { locateThing, readField, type ThingRef } from "../../items/things";
import { NEXT_TO_SQUARE, SQUARE, extendItems, handOver } from "../combat-test-kit";
import { OPEN_GROUND, placeThing } from "../rule-test-kit";
import { runSteps, runVerb, setUpSteps } from "./step-test-kit";

function withSmallBox() {
  const sim = setUpSteps();
  extendItems(sim, {
    definitions: [
      {
        id: "small_box",
        name: "small box",
        glyph: { index: 254, color: "#c08848" },
        components: { capacity: { max: 2 }, holdable: { kilograms: 1 } },
      },
    ],
  });
  return sim;
}

const PUT_IN_TARGET = [
  { step: "move", on: "item", into: "target", limit: { from: "target.capacity.max" } },
];

function refOf(entityId: string): ThingRef {
  return { kind: "entity", entityId };
}

describe("move", () => {
  it("drops the stack onto the tile where the user stands and picks it up again", () => {
    const sim = setUpSteps();
    const first = handOver(sim, "mara", "coin");
    const second = handOver(sim, "mara", "coin");
    const items = [first, second];
    const dropped = runSteps(sim, [{ step: "move", on: "item", at: "user" }], { items });
    expect(dropped.failure).toBeNull();
    for (const entity of items) {
      expect(findEntityIfPresent(sim.state, entity.id)?.location).toMatchObject({
        kind: "tile",
        pos: SQUARE,
      });
    }
    expect(dropped.run.verbRun?.touchedIds).toEqual([first.id, second.id]);
    expect(dropped.context.result.changedEntityIds).toEqual([first.id, second.id]);
    runSteps(sim, [{ step: "move", on: "item", into: "user" }], { items });
    expect(listContents(sim.state, "mara").map((entity) => entity.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("puts things into a container up to a limit read from its field", () => {
    const sim = withSmallBox();
    const box = handOver(sim, "mara", "small_box");
    const options = { target: refOf(box.id), targetName: "small box" };
    const [first, second, third] = [1, 2, 3].map(() => handOver(sim, "mara", "coin"));
    if (!first || !second || !third) throw new Error("expected three coins");
    expect(runSteps(sim, PUT_IN_TARGET, { items: [first], ...options }).failure).toBeNull();
    const tooMany = runSteps(sim, PUT_IN_TARGET, { items: [second, third], ...options });
    expect(tooMany.failure).toBe("the small box only had room for 1 more");
    expect(listContents(sim.state, box.id)).toHaveLength(1);
    runSteps(sim, PUT_IN_TARGET, { items: [second], ...options });
    const full = runSteps(sim, PUT_IN_TARGET, { items: [third], ...options });
    expect(full.failure).toBe("the small box was full");
  });

  it("refuses to put a container inside itself or inside its own contents", () => {
    const sim = withSmallBox();
    const outer = handOver(sim, "mara", "small_box");
    const inner = createEntity(sim.state, "small_box", locateInside(outer.id));
    const options = { items: [outer], targetName: "small box" };
    const intoItself = runSteps(sim, PUT_IN_TARGET, { ...options, target: refOf(outer.id) });
    expect(intoItself.failure).toBe("the small box can't go inside itself");
    const intoContents = runSteps(sim, PUT_IN_TARGET, { ...options, target: refOf(inner.id) });
    expect(intoContents.failure).toBe("the small box can't go inside itself");
  });

  it("lands a thrown thing on the target's tile when it hits and next to it when it misses", () => {
    const mark: ThingRef = { kind: "agent", agentId: "tobias" };
    const hitSim = setUpSteps(0);
    const rock = handOver(hitSim, "mara", "coin");
    runVerb(hitSim, "throw", { items: [rock], target: mark, targetName: "Tobias" });
    expect(locateThing(hitSim.state, refOf(rock.id))?.pos).toEqual(NEXT_TO_SQUARE);

    const missSim = setUpSteps();
    const coin = handOver(missSim, "mara", "coin");
    const miss = runVerb(missSim, "throw", { items: [coin], target: mark, targetName: "Tobias" });
    expect(miss.run.verbRun?.isHit).toBe(false);
    const landed = locateThing(missSim.state, refOf(coin.id));
    expect(landed).not.toBeNull();
    expect(computeChebyshevDistance(landed?.pos ?? SQUARE, NEXT_TO_SQUARE)).toBe(1);
  });

  it("does nothing to a body", () => {
    const sim = setUpSteps();
    const before = sim.agent("tobias").pos;
    runSteps(sim, [{ step: "move", on: "target", at: "user" }], {
      target: { kind: "agent", agentId: "tobias" },
    });
    expect(sim.agent("tobias").pos).toEqual(before);
  });
});

describe("create", () => {
  it("makes new entities in the user's hands and says what it made", () => {
    const sim = setUpSteps();
    const result = runSteps(sim, [{ step: "create", item: "bread", count: 4, into: "user" }]);
    expect(result.made).toEqual({ definitionId: "bread", count: 4 });
    expect(listContents(sim.state, "mara").map((entity) => entity.definitionId)).toEqual([
      "bread",
      "bread",
      "bread",
      "bread",
    ]);
  });

  it("counts the room that an earlier use_up frees in the same container", () => {
    const sim = withSmallBox();
    const box = handOver(sim, "mara", "small_box");
    createEntity(sim.state, "wheat", locateInside(box.id));
    createEntity(sim.state, "wheat", locateInside(box.id));
    const result = runSteps(
      sim,
      [
        { step: "use_up", in: "target", rule: { definition: "wheat" }, count: 2 },
        {
          step: "create",
          item: "bread",
          count: 2,
          into: "target",
          limit: { from: "target.capacity.max" },
        },
      ],
      { target: refOf(box.id), targetName: "small box" },
    );
    expect(result.failure).toBeNull();
    expect(listContents(sim.state, box.id).map((entity) => entity.definitionId)).toEqual([
      "bread",
      "bread",
    ]);
  });

  it("makes things on the tile of a thing, with the definition read from a field", () => {
    const sim = setUpSteps();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    runSteps(
      sim,
      [{ step: "create", item: { from: "target.breaks_into.item" }, count: 1, at: "target" }],
      { target: jar },
    );
    const made = sim.state.entities.filter((entity) => entity.definitionId === "shards");
    expect(made).toHaveLength(1);
    expect(made[0]?.location).toMatchObject({ kind: "tile", pos: OPEN_GROUND });
  });

  it("writes fields on each new entity, reading the decision's words and the user's name", () => {
    const sim = setUpSteps();
    const board = createEntity(sim.state, "notice_board", {
      kind: "tile",
      place: "x",
      pos: OPEN_GROUND,
    });
    const result = runVerb(sim, "post a note", {
      items: [board],
      choice: { text: "Meet at noon" },
    });
    expect(result.failure).toBeNull();
    const [note] = listContents(sim.state, board.id);
    if (!note) throw new Error("no note was made");
    expect(readField(sim.state, refOf(note.id), "writing.text")).toBe("Meet at noon");
    expect(readField(sim.state, refOf(note.id), "writing.author")).toBe(sim.agent("mara").name);
  });

  it("refuses over a limit read from a field, and when the decision gave no words", () => {
    const sim = withSmallBox();
    const box = handOver(sim, "mara", "small_box");
    const steps = [
      {
        step: "create",
        item: "coin",
        count: 1,
        into: "item",
        limit: { from: "item.capacity.max" },
      },
    ];
    expect(runSteps(sim, steps, { items: [box] }).failure).toBeNull();
    expect(runSteps(sim, steps, { items: [box] }).failure).toBeNull();
    expect(runSteps(sim, steps, { items: [box] }).failure).toBe("the small box was full");
    expect(listContents(sim.state, box.id)).toHaveLength(2);
    const board = createEntity(sim.state, "notice_board", {
      kind: "tile",
      place: "x",
      pos: OPEN_GROUND,
    });
    expect(runVerb(sim, "post a note", { items: [board] }).failure).toBe("I didn't say what");
  });
});

describe("create naming what it made, with fresh ids", () => {
  const makeLocks = {
    step: "create",
    item: "lock",
    count: 2,
    into: "user",
    as: "made",
    fields: { "lock.lockId": { newId: true } },
  };

  function heldLockIds(sim: ReturnType<typeof setUpSteps>): unknown[] {
    return listContents(sim.state, "mara").map((lock) =>
      readField(sim.state, refOf(lock.id), "lock.lockId"),
    );
  }

  it("gives each new entity its own id, counted on from the world", () => {
    const sim = setUpSteps();
    const counterBefore = sim.state.nextFreshId;
    expect(runSteps(sim, [makeLocks]).failure).toBeNull();
    const lockIds = heldLockIds(sim);
    expect(new Set(lockIds).size).toBe(2);
    expect(sim.state.nextFreshId).toBe(counterBefore + 2);
  });

  it("names the first entity it makes, for later steps to work on and read", () => {
    const sim = setUpSteps();
    const result = runSteps(sim, [
      makeLocks,
      { step: "set", on: "made", field: "lock.lockId", to: "the first" },
      {
        step: "create",
        item: "key",
        count: 1,
        into: "user",
        fields: { "key.lockId": { from: "made.lock.lockId" } },
      },
    ]);
    expect(result.failure).toBeNull();
    const [first, second] = heldLockIds(sim);
    expect(first).toBe("the first");
    expect(second).not.toBe("the first");
    const key = listContents(sim.state, "mara").find((entity) => entity.definitionId === "key");
    if (!key) throw new Error("no key was made");
    expect(readField(sim.state, refOf(key.id), "key.lockId")).toBe("the first");
  });
});

describe("transform and destroy", () => {
  it("transforms an entity where it is and notes it as touched", () => {
    const sim = setUpSteps();
    const jar = placeThing(sim, "jar", OPEN_GROUND);
    if (jar.kind !== "entity") throw new Error("expected an entity");
    const result = runSteps(sim, [{ step: "transform", on: "target", into: "shards" }], {
      target: jar,
    });
    expect(findEntityIfPresent(sim.state, jar.entityId)?.definitionId).toBe("shards");
    expect(result.run.verbRun?.touchedIds).toEqual([jar.entityId]);
  });

  it("destroys an entity and lets what was inside fall where it stood", () => {
    const sim = setUpSteps();
    const chest = createEntity(sim.state, "chest", { kind: "tile", place: "x", pos: OPEN_GROUND });
    const coin = createEntity(sim.state, "coin", locateInside(chest.id));
    runSteps(sim, [{ step: "destroy", on: "target" }], { target: refOf(chest.id) });
    expect(findEntityIfPresent(sim.state, chest.id)).toBeUndefined();
    expect(findEntityIfPresent(sim.state, coin.id)?.location).toMatchObject({
      kind: "tile",
      pos: OPEN_GROUND,
    });
  });

  it("does nothing to a living body", () => {
    const sim = setUpSteps();
    const result = runSteps(
      sim,
      [
        { step: "destroy", on: "target" },
        { step: "transform", on: "target", into: "shards" },
      ],
      { target: { kind: "agent", agentId: "tobias" } },
    );
    expect(result.failure).toBeNull();
    expect(sim.state.agents.map((agent) => agent.id)).toContain("tobias");
  });
});
