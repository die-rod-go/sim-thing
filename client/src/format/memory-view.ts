import { BUCKETS, type Bucket, type Memory } from "@village/shared";

/** True when the filter is empty or some tag contains it (case-insensitive). */
export function matchesTagFilter(memory: Memory, tagFilter: string): boolean {
  const needle = tagFilter.trim().toLowerCase();
  if (needle.length === 0) return true;
  return memory.tags.some((tag) => tag.toLowerCase().includes(needle));
}

export type MemorySortOrder = "newest" | "strongest";

export interface MemoryListFilter {
  /** null shows every bucket. */
  bucket: Bucket | null;
  tagFilter: string;
  sortOrder: MemorySortOrder;
}

/** One flat list for the memory tab, filtered by bucket and tag. */
export function listMemories(memories: Memory[], filter: MemoryListFilter): Memory[] {
  return memories
    .filter((memory) => filter.bucket === null || memory.bucket === filter.bucket)
    .filter((memory) => matchesTagFilter(memory, filter.tagFilter))
    .sort((first, second) =>
      filter.sortOrder === "strongest"
        ? second.strength - first.strength || second.tick - first.tick
        : second.tick - first.tick,
    );
}

export function countMemoriesByBucket(memories: Memory[]): Record<Bucket, number> {
  const counts = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0])) as Record<Bucket, number>;
  for (const memory of memories) counts[memory.bucket] += 1;
  return counts;
}

/** Distinct tags with how many memories carry each, most common first. */
export function countTags(memories: Memory[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const tag of memory.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((first, second) => second.count - first.count || first.tag.localeCompare(second.tag));
}
