import { describe, expect, it } from "vitest";
import type { Memory } from "@village/shared";
import { countMemoriesByBucket, countTags, listMemories } from "./memory-view";

function makeMemory(
  id: string,
  tick: number,
  tags: string[],
  bucket: Memory["bucket"],
  strength = 0.5,
): Memory {
  return { id, agentId: "ada", bucket, tick, text: id, tags, strength, lastRecalledTick: null };
}

const memories = [
  makeMemory("old", 1, ["Bakery"], "seen", 0.9),
  makeMemory("new", 9, ["bakery", "bob"], "seen", 0.2),
  makeMemory("talk", 5, ["bob"], "conversations", 0.6),
];

describe("memoryView", () => {
  it("lists every memory newest first without filters", () => {
    const ids = listMemories(memories, { bucket: null, tagFilter: "", sortOrder: "newest" });
    expect(ids.map((memory) => memory.id)).toEqual(["new", "talk", "old"]);
  });

  it("sorts by strength when asked", () => {
    const ids = listMemories(memories, { bucket: null, tagFilter: "", sortOrder: "strongest" });
    expect(ids.map((memory) => memory.id)).toEqual(["old", "talk", "new"]);
  });

  it("filters by bucket and by tag case-insensitively", () => {
    const seen = listMemories(memories, { bucket: "seen", tagFilter: "BAK", sortOrder: "newest" });
    expect(seen.map((memory) => memory.id)).toEqual(["new", "old"]);
  });

  it("counts memories in every bucket, including empty ones", () => {
    const counts = countMemoriesByBucket(memories);
    expect(counts.seen).toBe(2);
    expect(counts.people).toBe(0);
  });

  it("counts tags, most common first", () => {
    expect(countTags(memories)[0]).toEqual({ tag: "bob", count: 2 });
  });
});
