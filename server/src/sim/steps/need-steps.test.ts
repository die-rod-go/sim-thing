import { describe, expect, it } from "vitest";
import { findEntityIfPresent, listContents, locateInside } from "../../items/entity-store";
import { createEntity } from "../../items/entity-store";
import { contextOf, entityThing, handOver, setField } from "../combat-test-kit";
import { applyStep, findStepListRefusal } from "./step-registry";
import {
  buildStepRun,
  buildVerbRun,
  emptyHands,
  parseSteps,
  runSteps,
  setUpSteps,
} from "./step-test-kit";

const NEEDS_TWO_WHEAT = [
  { step: "use_up", in: "user", rule: { definition: "wheat" }, count: 2 },
  { step: "create", item: "bread", count: 1, into: "user" },
];

describe("require and use_up", () => {
  it("refuses with today's wording when the user holds none or too few", () => {
    const sim = setUpSteps();
    expect(runSteps(sim, NEEDS_TWO_WHEAT).failure).toBe("I don't have any wheat: I need 2 wheat");
    handOver(sim, "mara", "wheat");
    expect(runSteps(sim, NEEDS_TWO_WHEAT).failure).toBe(
      "I don't have enough wheat: I need 2 wheat and have 1",
    );
  });

  it("uses up the oldest matching things and leaves the rest", () => {
    const sim = setUpSteps();
    const oldest = handOver(sim, "mara", "wheat");
    const middle = handOver(sim, "mara", "wheat");
    const newest = handOver(sim, "mara", "wheat");
    const result = runSteps(sim, NEEDS_TWO_WHEAT);
    expect(result.failure).toBeNull();
    expect(findEntityIfPresent(sim.state, oldest.id)).toBeUndefined();
    expect(findEntityIfPresent(sim.state, middle.id)).toBeUndefined();
    expect(findEntityIfPresent(sim.state, newest.id)).toBeDefined();
    expect(result.run.verbRun?.touchedIds).toEqual([oldest.id, middle.id]);
    expect(result.made).toEqual({ definitionId: "bread", count: 1 });
  });

  it("does nothing when a later step in the same check cannot be met", () => {
    const sim = setUpSteps();
    const wheat = handOver(sim, "mara", "wheat");
    runSteps(sim, [
      { step: "use_up", in: "user", rule: { definition: "wheat" } },
      { step: "use_up", in: "user", rule: { definition: "wood" } },
    ]);
    expect(findEntityIfPresent(sim.state, wheat.id)).toBeDefined();
  });

  it("refuses up front when two use_up steps would need the same things", () => {
    const sim = setUpSteps();
    const wheat = handOver(sim, "mara", "wheat");
    handOver(sim, "mara", "wheat");
    const result = runSteps(sim, [...NEEDS_TWO_WHEAT, ...NEEDS_TWO_WHEAT]);
    expect(result.failure).toBe("I don't have any wheat: I need 2 wheat");
    expect(findEntityIfPresent(sim.state, wheat.id)).toBeDefined();
  });

  it("never counts the item the verb is used with", () => {
    const sim = setUpSteps();
    const bread = handOver(sim, "mara", "bread");
    const steps = [{ step: "require", in: "user", rule: { definition: "bread" } }];
    expect(runSteps(sim, steps, { items: [bread] }).failure).toMatch(/I don't have any bread/);
    handOver(sim, "mara", "bread");
    expect(runSteps(sim, steps, { items: [bread] }).failure).toBeNull();
  });

  it("matches by component and keeps what it requires", () => {
    const sim = setUpSteps();
    const steps = [{ step: "require", in: "user", rule: { has: "sharp" } }];
    expect(runSteps(sim, steps).failure).toBe(
      "I need a knife, an axe or a broken bottle for that and have none",
    );
    const knife = handOver(sim, "mara", "knife");
    expect(runSteps(sim, steps).failure).toBeNull();
    expect(findEntityIfPresent(sim.state, knife.id)).toBeDefined();
  });

  it("takes from inside the item, and a later step reads what it took by name after it is gone", () => {
    const sim = setUpSteps();
    const gun = handOver(sim, "mara", "gun");
    const bullet = createEntity(sim.state, "bullet", locateInside(gun.id));
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "mara" ? { ...agent, needs: { ...agent.needs, hunger: 0.5 } } : agent,
    );
    const result = runSteps(
      sim,
      [
        { step: "use_up", in: "item", rule: { has: "ammo" }, as: "round" },
        {
          step: "change_need",
          on: "user",
          need: "hunger",
          amount: { from: "round.holdable.kilograms" },
        },
        { step: "change_need", on: "user", need: "fun", amount: -0.1, evenOnMiss: true },
      ],
      { items: [gun] },
    );
    expect(result.failure).toBeNull();
    expect(findEntityIfPresent(sim.state, bullet.id)).toBeUndefined();
    expect(listContents(sim.state, gun.id)).toEqual([]);
    expect(sim.agent("mara").needs.hunger).toBeCloseTo(0.51);
  });

  it("refuses with the item's name when the gun holds no ammunition", () => {
    const sim = setUpSteps();
    const gun = handOver(sim, "mara", "gun");
    const steps = [{ step: "use_up", in: "item", rule: { definition: "bullet" } }];
    expect(runSteps(sim, steps, { items: [gun] }).failure).toBe("the gun has no bullets");
    const generic = [{ step: "use_up", in: "item", rule: { has: "ammo" } }];
    expect(runSteps(sim, generic, { items: [gun] }).failure).toBe(
      "there wasn't what it needs in the gun: it needs a bullet",
    );
  });

  it("doesn't judge up front a name not picked yet, but refuses once nothing has it", () => {
    const sim = setUpSteps();
    const steps = parseSteps([
      { step: "check", on: "round", if: { has: "ammo" }, otherwise: "no round" },
    ]);
    const run = buildStepRun(contextOf(sim), buildVerbRun(sim));
    expect(findStepListRefusal(run, steps)).toBeNull();
    expect(applyStep(run, steps[0]!)).toEqual({ kind: "refused", reason: "no round" });
  });
});

describe("check", () => {
  const CHECK_STOCK = [
    {
      step: "check",
      on: "item",
      if: { field: "stock.amount", atLeast: 3 },
      otherwise: "the {item} is empty",
    },
  ];

  it("refuses with its own words, filling in the item", () => {
    const sim = setUpSteps();
    const field = createEntity(sim.state, "wheat_field", locateInside("mara"));
    expect(runSteps(sim, CHECK_STOCK, { items: [field] }).failure).toBeNull();
    const empty = runSteps(
      sim,
      [{ ...CHECK_STOCK[0], if: { field: "stock.amount", atLeast: 99 } }],
      {
        items: [field],
      },
    );
    expect(empty.failure).toBe("the wheat field is empty");
  });

  it("fills in the target too, and checks the target's components", () => {
    const sim = setUpSteps();
    const steps = [
      { step: "check", on: "target", if: { has: "alive" }, otherwise: "{target} is not alive" },
    ];
    const bench = createEntity(sim.state, "bench", {
      kind: "tile",
      place: "x",
      pos: { x: 1, y: 1 },
    });
    const result = runSteps(sim, steps, {
      target: { kind: "entity", entityId: bench.id },
      targetName: "bench",
    });
    expect(result.failure).toBe("bench is not alive");
  });
});

describe("matchers that read a value of the run", () => {
  /** Mara holds an older key and the key the verb is done with, cut for the given locks. */
  function holdKeys(sim: ReturnType<typeof setUpSteps>, olderLockId: string, itemLockId: string) {
    const older = handOver(sim, "mara", "key");
    const item = handOver(sim, "mara", "key");
    setField(sim, entityThing(older), "key.lockId", olderLockId);
    setField(sim, entityThing(item), "key.lockId", itemLockId);
    return item;
  }

  const MATCH_THE_OLDER_KEY = [
    { step: "require", in: "user", rule: { has: "key" }, as: "older" },
    {
      step: "check",
      on: "item",
      if: { field: "key.lockId", equals: { from: "older.key.lockId" } },
      otherwise: "the keys don't match",
    },
  ];

  it("judges a check reading an earlier pick once that pick is made", () => {
    const sim = setUpSteps();
    const matching = holdKeys(sim, "cellar", "cellar");
    expect(runSteps(sim, MATCH_THE_OLDER_KEY, { items: [matching] }).failure).toBeNull();
    emptyHands(sim, "mara");
    const other = holdKeys(sim, "cellar", "attic");
    expect(runSteps(sim, MATCH_THE_OLDER_KEY, { items: [other] }).failure).toBe(
      "the keys don't match",
    );
  });

  it("picks only what the read value matches", () => {
    const sim = setUpSteps();
    const item = holdKeys(sim, "attic", "cellar");
    const sameLock = handOver(sim, "mara", "key");
    setField(sim, entityThing(sameLock), "key.lockId", "cellar");
    const steps = [
      {
        step: "use_up",
        in: "user",
        rule: {
          allOf: [{ has: "key" }, { field: "key.lockId", equals: { from: "item.key.lockId" } }],
        },
      },
    ];
    expect(runSteps(sim, steps, { items: [item] }).failure).toBeNull();
    expect(findEntityIfPresent(sim.state, sameLock.id)).toBeUndefined();
    expect(listContents(sim.state, "mara")).toHaveLength(2);
  });
});
