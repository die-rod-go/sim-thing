import { describe, expect, it } from "vitest";
import { executeGive } from "./give";
import { makeAgent } from "./test-fixtures";

const mara = makeAgent({
  id: "mara",
  name: "Mara",
  pos: { x: 5, y: 5 },
  coins: 30,
  inventory: { bread: 1 },
});
const bob = makeAgent({ id: "bob", name: "Bob", pos: { x: 6, y: 6 }, coins: 10 });

describe("give", () => {
  it("give moves coins between adjacent agents", () => {
    const result = executeGive({ giver: mara, recipient: bob, item: "Coins", amount: 3 });
    if (!result.isSuccess) {
      throw new Error(result.reason);
    }
    expect(result.giver.coins).toBe(27);
    expect(result.recipient.coins).toBe(13);
  });

  it("give moves items and drops emptied entries", () => {
    const result = executeGive({ giver: mara, recipient: bob, item: "bread", amount: 1 });
    if (!result.isSuccess) {
      throw new Error(result.reason);
    }
    expect(result.giver.inventory).toEqual({});
    expect(result.recipient.inventory).toEqual({ bread: 1 });
  });

  it("give fails when the recipient is out of reach", () => {
    const farBob = { ...bob, pos: { x: 7, y: 5 } };
    expect(executeGive({ giver: mara, recipient: farBob, item: "coins", amount: 1 })).toEqual({
      isSuccess: false,
      reason: "Bob is too far away to hand anything to",
    });
  });

  it("give fails when the giver doesn't have enough", () => {
    expect(executeGive({ giver: mara, recipient: bob, item: "bread", amount: 2 })).toEqual({
      isSuccess: false,
      reason: "I only have 1 bread",
    });
  });

  it("give fails for amounts that aren't positive whole numbers", () => {
    for (const amount of [0, -1, 1.5]) {
      expect(executeGive({ giver: mara, recipient: bob, item: "coins", amount }).isSuccess).toBe(
        false,
      );
    }
  });

  it("give never creates coins", () => {
    const attempts = [
      { item: "coins", amount: 30 },
      { item: "coins", amount: 31 },
      { item: "coins", amount: -5 },
    ];
    for (const attempt of attempts) {
      const result = executeGive({ giver: mara, recipient: bob, ...attempt });
      const total = result.isSuccess
        ? result.giver.coins + result.recipient.coins
        : mara.coins + bob.coins;
      expect(total).toBe(40);
    }
  });
});
