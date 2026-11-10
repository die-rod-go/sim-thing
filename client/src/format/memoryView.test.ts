import { describe, expect, it } from "vitest";
import type { Memory } from "@village/shared";
import { makeSampleAgent } from "../fixtures/sampleData";
import { buildAwarenessRows, countTags, groupMemoriesByBucket } from "./memoryView";

function makeMemory(id: string, tick: number, tags: string[], bucket: Memory["bucket"]): Memory {
  return {
    id,
    agentId: "ada",
    bucket,
    tick,
    text: id,
    tags,
    strength: 0.5,
    lastRecalledTick: null,
  };
}

const memories = [
  makeMemory("old", 1, ["Bakery"], "seen"),
  makeMemory("new", 9, ["bakery", "bob"], "seen"),
  makeMemory("talk", 5, ["bob"], "conversations"),
];

describe("memoryView", () => {
  it("groups memories by bucket, newest first", () => {
    const groups = groupMemoriesByBucket(memories, "");
    const seen = groups.find((group) => group.bucket === "seen");
    expect(seen?.memories.map((memory) => memory.id)).toEqual(["new", "old"]);
    expect(groups.map((group) => group.bucket)[0]).toBe("seen");
  });

  it("filters by tag case-insensitively", () => {
    const groups = groupMemoriesByBucket(memories, "BAK");
    const ids = groups.flatMap((group) => group.memories.map((memory) => memory.id));
    expect(ids).toEqual(["new", "old"]);
  });

  it("counts tags, most common first", () => {
    expect(countTags(memories)[0]).toEqual({ tag: "bob", count: 2 });
  });

  it("lists awareness with names and sim-minutes since perceived", () => {
    const ada = makeSampleAgent("ada", "Ada", 0, 0);
    const bob = makeSampleAgent("bob", "Bob", 1, 1);
    ada.awareness = {
      bob: { agentId: "bob", tick: 40, via: "heard_muffled", place: "tavern", doing: "talking" },
      ghost: { agentId: "ghost", tick: 10, via: "saw", place: "square", doing: "standing" },
    };
    const rows = buildAwarenessRows(ada, [ada, bob], 50, 2);
    expect(rows.map((row) => row.name)).toEqual(["Bob", "ghost"]);
    expect(rows[0]?.minutesAgo).toBe(20);
  });
});
