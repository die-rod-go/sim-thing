import { describe, expect, it } from "vitest";
import { loadTestItems } from "../sim/test-sim";
import {
  createEntity,
  findEntity,
  findEntityIfPresent,
  moveEntity,
  removeEntity,
  type EntityWorld,
} from "./entity-store";

const OUTSIDE = { kind: "tile", place: "village road", pos: { x: 1, y: 1 } } as const;

function buildWorld(): EntityWorld {
  return { agents: [], entities: [], nextEntityId: 1, items: loadTestItems() };
}

describe("finding entities by id", () => {
  it("finds entities made after earlier lookups", () => {
    const world = buildWorld();
    const first = createEntity(world, "bread", OUTSIDE);
    expect(findEntity(world, first.id)).toBe(first);
    const second = createEntity(world, "wood", OUTSIDE);
    expect(findEntity(world, second.id)).toBe(second);
  });

  it("finds the replaced entity, not the one it replaced", () => {
    const world = buildWorld();
    const bread = createEntity(world, "bread", OUTSIDE);
    findEntity(world, bread.id);
    const moved = moveEntity(world, bread.id, { ...OUTSIDE, pos: { x: 2, y: 2 } });
    expect(findEntity(world, bread.id)).toBe(moved);
  });

  it("still finds the others after one is removed ahead of them", () => {
    const world = buildWorld();
    const [first, second, third] = ["bread", "wood", "wheat"].map((definitionId) =>
      createEntity(world, definitionId, OUTSIDE),
    );
    if (!first || !second || !third) throw new Error("expected three entities");
    findEntity(world, third.id);
    removeEntity(world, first.id);
    expect(findEntityIfPresent(world, first.id)).toBeUndefined();
    expect(findEntity(world, second.id)).toBe(second);
    expect(findEntity(world, third.id)).toBe(third);
  });

  it("finds entities in a list rearranged in place", () => {
    const world = buildWorld();
    const bread = createEntity(world, "bread", OUTSIDE);
    const wood = createEntity(world, "wood", OUTSIDE);
    findEntity(world, bread.id);
    world.entities.reverse();
    expect(findEntity(world, bread.id)).toBe(bread);
    expect(findEntity(world, wood.id)).toBe(wood);
  });
});
