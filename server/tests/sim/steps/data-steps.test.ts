import { describe, expect, it } from "vitest";
import { config } from "../../../src/config";
import { findEntityIfPresent } from "../../../src/items/entity-store";
import { readComponents, readNumberField } from "../../../src/items/things";
import { computeConditionEndTick } from "../../../src/status/conditions";
import { scaleByStrength } from "../../../src/status/combat";
import { fixRolls, handOver, readHealth } from "../combat-test-kit";
import { OPEN_GROUND, TOBIAS, placeThing } from "../rule-test-kit";
import { runRuleSteps, runSteps, setUpSteps } from "./step-test-kit";

function entityIdOf(thing: ReturnType<typeof placeThing>): string {
  if (thing.kind !== "entity") throw new Error("expected an entity");
  return thing.entityId;
}

describe("damage", () => {
  it("lowers the target's health by a rolled range, scaled by the user's strength", () => {
    const sim = setUpSteps();
    fixRolls(sim, 0);
    const knife = handOver(sim, "mara", "knife");
    runSteps(
      sim,
      [
        {
          step: "damage",
          on: "target",
          field: "health.current",
          amount: { from: "item.weapon.damage" },
          scaledByStrength: true,
        },
      ],
      { items: [knife], target: TOBIAS },
    );
    const strength = sim.agent("mara").body.strength;
    expect(readHealth(sim, "tobias")).toBeCloseTo(1 - scaleByStrength(0.2, strength));
  });

  it("makes a hurt event for a living agent when no hit roll already showed it", () => {
    const sim = setUpSteps();
    const result = runSteps(
      sim,
      [{ step: "damage", on: "target", field: "health.current", amount: 0.1 }],
      { target: TOBIAS },
    );
    expect(result.context.result.events.map((event) => event.kind)).toContain("hurt");
    expect(readHealth(sim, "tobias")).toBeCloseTo(0.9);
  });

  it("makes no hurt event for the target of a hit roll, which the runner announces", () => {
    const sim = setUpSteps(0);
    const result = runSteps(
      sim,
      [
        { step: "roll_hit", chance: 0.5 },
        { step: "damage", on: "target", field: "health.current", amount: 0.1 },
      ],
      { target: TOBIAS },
    );
    expect(result.run.verbRun?.isHit).toBe(true);
    expect(result.context.result.events).toEqual([]);
    expect(readHealth(sim, "tobias")).toBeCloseTo(0.9);
  });

  it("makes no hurt event in a rule", () => {
    const sim = setUpSteps();
    const context = runRuleSteps(sim, TOBIAS, [
      { step: "damage", field: "health.current", amount: 0.1 },
    ]);
    expect(context.result.events).toEqual([]);
    expect(readHealth(sim, "tobias")).toBeCloseTo(0.9);
  });

  it("skips a thing without the field and wears the item's own health", () => {
    const sim = setUpSteps();
    const field = placeThing(sim, "wheat_field", OPEN_GROUND);
    const knife = handOver(sim, "mara", "knife");
    const result = runSteps(
      sim,
      [
        { step: "damage", on: "target", field: "health.current", amount: 0.1 },
        { step: "damage", on: "item", field: "health.current", amount: 0.5 },
      ],
      { items: [knife], target: field },
    );
    expect(result.context.result.changedEntityIds).toEqual([knife.id]);
    expect(
      readNumberField(sim.state, { kind: "entity", entityId: knife.id }, "health.current"),
    ).toBe(3.5);
  });
});

describe("change and set", () => {
  it("adds a number read from the item to the target's field", () => {
    const sim = setUpSteps();
    const bandage = handOver(sim, "mara", "bandage");
    runSteps(sim, [{ step: "damage", on: "target", field: "health.current", amount: 0.5 }], {
      target: TOBIAS,
    });
    runSteps(
      sim,
      [
        {
          step: "change",
          on: "target",
          field: "health.current",
          by: { from: "item.healing.health" },
        },
      ],
      { items: [bandage], target: TOBIAS },
    );
    expect(readHealth(sim, "tobias")).toBeCloseTo(0.65);
  });

  it("applies to every entity of the stack when on is item", () => {
    const sim = setUpSteps();
    const first = placeThing(sim, "bench", OPEN_GROUND);
    const second = placeThing(sim, "bench", OPEN_GROUND);
    const items = [entityIdOf(first), entityIdOf(second)].map((entityId) => {
      const entity = findEntityIfPresent(sim.state, entityId);
      if (!entity) throw new Error("missing bench");
      return entity;
    });
    runSteps(sim, [{ step: "set", on: "item", field: "health.current", to: 1 }], { items });
    expect(readNumberField(sim.state, first, "health.current")).toBe(1);
    expect(readNumberField(sim.state, second, "health.current")).toBe(1);
  });
});

describe("add and remove", () => {
  it("adds a component for some minutes with fields, stamped with the user", () => {
    const sim = setUpSteps();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    runSteps(
      sim,
      [{ step: "add", on: "target", component: "writing", minutes: 10, fields: { text: "hello" } }],
      { target: bench },
    );
    expect(readComponents(sim.state, bench)?.writing?.text).toBe("hello");
    const changes = findEntityIfPresent(sim.state, entityIdOf(bench))?.changes;
    expect(changes?.writing?.sourceId).toBe("mara");
    expect(changes?.writing?.endsAtTick).toBe(
      computeConditionEndTick(10, sim.state.tick, config.clock.minutesPerTick),
    );
  });

  it("removes a component", () => {
    const sim = setUpSteps();
    runRuleSteps(sim, TOBIAS, [{ step: "add", component: "wet" }]);
    expect(readComponents(sim.state, TOBIAS)).toHaveProperty("wet");
    runSteps(sim, [{ step: "remove", on: "target", component: "wet" }], { target: TOBIAS });
    expect(readComponents(sim.state, TOBIAS)).not.toHaveProperty("wet");
  });
});
