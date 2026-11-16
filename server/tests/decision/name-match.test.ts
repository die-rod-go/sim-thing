import { describe, expect, it } from "vitest";
import { listNameWords, scoreNameMatch } from "../../src/decision/name-match";

describe("name matching", () => {
  it("matches on words without articles, possessives or plurals", () => {
    expect([...listNameWords("The butcher's back doors")]).toEqual(["butcher", "back", "door"]);
  });

  it("gives an identical name a full score whatever its case and articles", () => {
    expect(scoreNameMatch("the Well", "well")).toBe(1);
  });

  it("scores a shortened name by the words it shares", () => {
    expect(scoreNameMatch("north spot", "north fishing spot")).toBeCloseTo(2 / 3);
  });

  it("scores a made-up room low against a real door that shares one word", () => {
    expect(scoreNameMatch("back room", "guest room door")).toBe(0.25);
  });

  it("scores names with no words in common as zero", () => {
    expect(scoreNameMatch("linen", "tavern chest")).toBe(0);
    expect(scoreNameMatch("the", "tavern chest")).toBe(0);
  });
});
