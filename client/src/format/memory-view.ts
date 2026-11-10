import { BUCKETS, type Agent, type AwarenessVia, type Bucket, type Memory } from "@village/shared";

/** True when the filter is empty or some tag contains it (case-insensitive). */
export function matchesTagFilter(memory: Memory, tagFilter: string): boolean {
  const needle = tagFilter.trim().toLowerCase();
  if (needle.length === 0) return true;
  return memory.tags.some((tag) => tag.toLowerCase().includes(needle));
}

/** Memories per bucket in brief order, newest first, after the tag filter. */
export function groupMemoriesByBucket(
  memories: Memory[],
  tagFilter: string,
): { bucket: Bucket; memories: Memory[] }[] {
  const filtered = memories.filter((memory) => matchesTagFilter(memory, tagFilter));
  return BUCKETS.map((bucket) => ({
    bucket,
    memories: filtered
      .filter((memory) => memory.bucket === bucket)
      .sort((first, second) => second.tick - first.tick),
  }));
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

export interface AwarenessRow {
  agentId: string;
  name: string;
  via: AwarenessVia;
  place: string;
  doing: string;
  minutesAgo: number;
}

/** The awareness record as rows, most recently perceived first. */
export function buildAwarenessRows(
  agent: Agent,
  allAgents: Agent[],
  currentTick: number,
  minutesPerTick: number,
): AwarenessRow[] {
  const namesById = new Map(allAgents.map((other) => [other.id, other.name]));
  return Object.values(agent.awareness)
    .map((awareness) => ({
      agentId: awareness.agentId,
      name: namesById.get(awareness.agentId) ?? awareness.agentId,
      via: awareness.via,
      place: awareness.place,
      doing: awareness.doing,
      minutesAgo: Math.max(0, (currentTick - awareness.tick) * minutesPerTick),
    }))
    .sort((first, second) => first.minutesAgo - second.minutesAgo);
}
