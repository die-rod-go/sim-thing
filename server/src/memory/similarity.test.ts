import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { createLexicalSimilarity } from "./similarity";

function makeMemory(id: string, text: string): Memory {
  return {
    id,
    agentId: "mara",
    bucket: "did",
    tick: 0,
    text,
    tags: [],
    strength: 1,
    lastRecalledTick: null,
  };
}

describe("createLexicalSimilarity", () => {
  it("matches words that share a stem", () => {
    const watering = makeMemory("a", "I was watering the garden");
    const score = createLexicalSimilarity("water", [watering])(watering);
    expect(score).toBe(1);
  });

  it("does not count stop words", () => {
    const memory = makeMemory("a", "the and with that");
    expect(createLexicalSimilarity("the and with that", [memory])(memory)).toBe(0);
  });

  it("scores a rare shared word above a common one", () => {
    const memories = [
      makeMemory("a", "bread bread axe"),
      makeMemory("b", "bread loaf"),
      makeMemory("c", "bread crumbs"),
    ];
    const score = createLexicalSimilarity("axe bread", memories);
    expect(score(memories[0]!)).toBeGreaterThan(score(memories[1]!));
    expect(score(memories[0]!)).toBeLessThanOrEqual(1);
  });

  it("scores zero for an empty cue", () => {
    const memory = makeMemory("a", "water well");
    expect(createLexicalSimilarity("", [memory])(memory)).toBe(0);
  });
});
