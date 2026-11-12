import { describe, expect, it } from "vitest";
import {
  countHeld,
  createEntity,
  listHeldEntities,
  locateInside,
  type EntityWorld,
} from "../items/entity-store";
import { loadTestItems } from "../sim/test-sim";
import { executeGive } from "./give";
import { makeAgent } from "./test-fixtures";

const items = loadTestItems();

function buildWorld(): EntityWorld {
  const mara = makeAgent({ id: "mara", name: "Mara", pos: { x: 5, y: 5 } });
  const bob = makeAgent({ id: "bob", name: "Bob", pos: { x: 6, y: 6 } });
  const world: EntityWorld = { agents: [mara, bob], entities: [], nextEntityId: 1, items };
  const handOut = (agentId: string, definitionId: string, count: number) => {
    for (let made = 0; made < count; made += 1) {
      createEntity(world, definitionId, locateInside(agentId));
    }
  };
  handOut("mara", "coin", 30);
  handOut("mara", "bread", 1);
  handOut("bob", "coin", 10);
  return world;
}

function giveFromMara(
  world: EntityWorld,
  itemName: string,
  amount: number,
  bobPos = { x: 6, y: 6 },
) {
  const [mara, bob] = world.agents;
  if (!mara || !bob) throw new Error("missing agents");
  return executeGive(world, { giver: mara, recipient: { ...bob, pos: bobPos }, itemName, amount });
}

describe("give", () => {
  it("moves coins as coin entities between adjacent agents", () => {
    const world = buildWorld();
    const result = giveFromMara(world, "Coins", 3);
    if (!result.isSuccess) throw new Error(result.reason);
    expect(countHeld(world, "mara", "coin")).toBe(27);
    expect(countHeld(world, "bob", "coin")).toBe(13);
    expect(result.description).toBe("3 coins");
  });

  it("hands over the oldest matching entities first", () => {
    const world = buildWorld();
    const maraCoins = listHeldEntities(world, "mara").filter(
      (entity) => entity.definitionId === "coin",
    );
    const result = giveFromMara(world, "coin", 2);
    if (!result.isSuccess) throw new Error(result.reason);
    expect(result.movedEntityIds).toEqual(maraCoins.slice(0, 2).map((entity) => entity.id));
  });

  it("moves items like any other entity", () => {
    const world = buildWorld();
    const result = giveFromMara(world, "bread", 1);
    if (!result.isSuccess) throw new Error(result.reason);
    expect(countHeld(world, "mara", "bread")).toBe(0);
    expect(countHeld(world, "bob", "bread")).toBe(1);
  });

  it("fails when the recipient is out of reach", () => {
    expect(giveFromMara(buildWorld(), "coins", 1, { x: 7, y: 5 })).toEqual({
      isSuccess: false,
      reason: "Bob is too far away to hand anything to",
    });
  });

  it("fails when the giver doesn't have enough", () => {
    expect(giveFromMara(buildWorld(), "bread", 2)).toEqual({
      isSuccess: false,
      reason: "I only have 1 bread",
    });
  });

  it("hands over a held item named by its instance name", () => {
    const world = buildWorld();
    const axe = createEntity(world, "bread", locateInside("mara"), "woodcutter's axe 1");
    const result = giveFromMara(world, "Woodcutter's Axe 1", 1);
    if (!result.isSuccess) throw new Error(result.reason);
    expect(result.movedEntityIds).toEqual([axe.id]);
    expect(result.description).toBe("woodcutter's axe 1");
    expect(countHeld(world, "mara", "bread")).toBe(1);
    expect(countHeld(world, "bob", "bread")).toBe(1);
  });

  it("fails to give an instance name the giver doesn't hold", () => {
    const world = buildWorld();
    createEntity(world, "bread", locateInside("bob"), "woodcutter's axe 1");
    expect(giveFromMara(world, "woodcutter's axe 1", 1)).toEqual({
      isSuccess: false,
      reason: "I don't have any woodcutter's axe 1",
    });
  });

  it("fails for amounts that aren't positive whole numbers", () => {
    for (const amount of [0, -1, 1.5]) {
      expect(giveFromMara(buildWorld(), "coins", amount).isSuccess).toBe(false);
    }
  });

  it("never creates or destroys coins", () => {
    for (const amount of [30, 31, -5]) {
      const world = buildWorld();
      giveFromMara(world, "coins", amount);
      expect(countHeld(world, "mara", "coin") + countHeld(world, "bob", "coin")).toBe(40);
    }
  });
});
