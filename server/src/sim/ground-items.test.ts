import type { Entity, Position } from "@village/shared";
import { describe, expect, it } from "vitest";
import { computeChebyshevDistance } from "../economy/give";
import { countHeld, createEntity, findEntity, listTileEntitiesAt } from "../items/entity-store";
import { isWalkable } from "../world/pathfinding";
import {
  aimWith,
  buildCombatSim,
  finish,
  fixRolls,
  handOver,
  lastFailure,
  memoryTexts,
  NEXT_TO_SQUARE,
  place,
  readHealth,
  SQUARE,
} from "./combat-test-kit";
import { buildWalkingGrid } from "./world-access";
import type { TestSim } from "./test-sim";

function dropOnSquare(sim: TestSim, definitionId: string): Entity {
  return createEntity(sim.state, definitionId, { kind: "tile", place: "town square", pos: SQUARE });
}

function tileOf(sim: TestSim, entityId: string): Position | null {
  const { location } = findEntity(sim.state, entityId);
  return location.kind === "tile" ? location.pos : null;
}

describe("dropping and picking up", () => {
  it("drops a held thing at the agent's feet, seen by those nearby", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const breadBefore = countHeld(sim.state, "mara", "bread");
    const [bread] = sim.state.entities.filter(
      (entity) => entity.definitionId === "bread" && entity.location.kind === "inside",
    );
    if (!bread) throw new Error("the seeds give Mara bread");
    aimWith(sim, "mara", bread, "drop");
    finish(sim, "mara");
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore - 1);
    expect(tileOf(sim, bread.id)).toEqual(SQUARE);
    expect(memoryTexts(sim, "mara")).toContain("I dropped bread");
    expect(memoryTexts(sim, "tobias").some((text) => text.includes("dropped bread"))).toBe(true);
  });

  it("picks up an item lying on the ground", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const knife = dropOnSquare(sim, "knife");
    aimWith(sim, "mara", knife, "pick up");
    finish(sim, "mara");
    expect(findEntity(sim.state, knife.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    expect(memoryTexts(sim, "mara")).toContain("I picked up knife");
  });

  it("gives a ground item to whoever reaches it first when two agents grab it", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const knife = dropOnSquare(sim, "knife");
    aimWith(sim, "mara", knife, "pick up");
    aimWith(sim, "tobias", knife, "pick up");
    finish(sim, "mara");
    finish(sim, "tobias");
    expect(findEntity(sim.state, knife.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    expect(lastFailure(sim, "tobias")).toContain("there is no knife here");
  });
});

describe("throwing", () => {
  it("lands a thrown item on the target's tile when it hits", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: { x: 22, y: 15 } });
    const knife = handOver(sim, "mara", "knife");
    fixRolls(sim, 0);
    aimWith(sim, "mara", knife, "throw", "Tobias");
    finish(sim, "mara");
    expect(tileOf(sim, knife.id)).toEqual({ x: 22, y: 15 });
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
  });

  it("lands a missed throw on a free tile next to the target", () => {
    const sim = buildCombatSim();
    const target = { x: 22, y: 15 };
    place(sim, { mara: SQUARE, tobias: target });
    const knife = handOver(sim, "mara", "knife");
    fixRolls(sim, 0.99);
    aimWith(sim, "mara", knife, "throw", "Tobias");
    finish(sim, "mara");
    const landed = tileOf(sim, knife.id);
    if (!landed) throw new Error("the knife should be on the ground");
    expect(computeChebyshevDistance(landed, target)).toBe(1);
    expect(isWalkable(buildWalkingGrid(sim.state), landed)).toBe(true);
    expect(readHealth(sim, "tobias")).toBe(1);
    expect(listTileEntitiesAt(sim.state, "town square").map((entity) => entity.id)).toContain(
      knife.id,
    );
  });
});
