import { simHoursBetween } from "@village/shared";
import type { Bucket, Memory } from "@village/shared";
import { config } from "../config";
import type { MemoryIdGenerator, MemoryReader } from "../memory/memory-store";
import { extractTags, normalizeTag, uniqueTags } from "../memory/tags";

/** Marks what a `reflections` memory is, so later passes can find it by tag. */
export const DAY_SUMMARY_TAG = "day summary";
export const MOOD_ENTRY_TAG = "mood entry";
export const INSIGHT_TAG = "insight";

/** People notes and earlier reflections are shown separately, so the day's memories skip them. */
const BUCKETS_OUTSIDE_THE_DAY: readonly Bucket[] = ["people", "reflections"];
const INTERACTION_BUCKETS: readonly Bucket[] = ["did", "conversations"];

export interface ReflectionMemoryDraft {
  agentId: string;
  text: string;
  kindTag: string;
  strength: number;
}

export function createReflectionMemory(
  draft: ReflectionMemoryDraft,
  tick: number,
  idGenerator: MemoryIdGenerator,
  knownNames: readonly string[],
): Memory {
  return {
    id: idGenerator.nextId(draft.agentId, tick),
    agentId: draft.agentId,
    bucket: "reflections",
    tick,
    text: draft.text,
    tags: uniqueTags([draft.kindTag, ...extractTags(draft.text, knownNames)]),
    strength: draft.strength,
    lastRecalledTick: null,
  };
}

function hasTag(memory: Memory, tag: string): boolean {
  return memory.tags.includes(normalizeTag(tag));
}

function compareStrongestThenNewest(first: Memory, second: Memory): number {
  if (first.strength !== second.strength) return second.strength - first.strength;
  return second.tick - first.tick;
}

function compareOldestFirst(first: Memory, second: Memory): number {
  return first.tick - second.tick || first.id.localeCompare(second.id);
}

function selectStrongestInTimeOrder(memories: Memory[], limit: number): Memory[] {
  return memories.sort(compareStrongestThenNewest).slice(0, limit).sort(compareOldestFirst);
}

/** The agent's memories from the last `nightMemoryWindowHours`, capped strongest/newest first, in time order. */
export function selectDayMemories(memories: MemoryReader, agentId: string, tick: number): Memory[] {
  const dayMemories = memories
    .listByAgent(agentId)
    .filter(
      (memory) =>
        !BUCKETS_OUTSIDE_THE_DAY.includes(memory.bucket) &&
        simHoursBetween(memory.tick, tick, config.clock.minutesPerTick) <=
          config.reflection.nightMemoryWindowHours,
    );
  return selectStrongestInTimeOrder(dayMemories, config.reflection.nightMemoriesShown);
}

/** The agent's memories filed after `sinceTick`, capped strongest/newest first, in time order. */
export function selectMemoriesSince(
  memories: MemoryReader,
  agentId: string,
  sinceTick: number,
): Memory[] {
  const recentMemories = memories
    .listByAgent(agentId)
    .filter(
      (memory) => !BUCKETS_OUTSIDE_THE_DAY.includes(memory.bucket) && memory.tick > sinceTick,
    );
  return selectStrongestInTimeOrder(recentMemories, config.reflection.daytimeMemoriesShown);
}

/** Names from `candidateNames` tagged in the agent's own actions and conversations. */
export function findPeopleInteractedWith(
  dayMemories: readonly Memory[],
  candidateNames: readonly string[],
): string[] {
  const interactionMemories = dayMemories.filter((memory) =>
    INTERACTION_BUCKETS.includes(memory.bucket),
  );
  return candidateNames.filter((name) =>
    interactionMemories.some((memory) => hasTag(memory, name)),
  );
}

/** The newest `peopleNotesShownPerPerson` notes the agent holds about `person`. */
export function selectPeopleNotes(
  memories: MemoryReader,
  agentId: string,
  person: string,
): Memory[] {
  return memories
    .listByAgentAndBucket(agentId, "people")
    .filter((memory) => hasTag(memory, person))
    .sort((first, second) => second.tick - first.tick)
    .slice(0, config.reflection.peopleNotesShownPerPerson);
}

/** The newest `count` reflections carrying `tag`, oldest first. */
export function selectTaggedReflections(
  memories: MemoryReader,
  agentId: string,
  tag: string,
  count: number,
): Memory[] {
  return memories
    .listByAgentAndBucket(agentId, "reflections")
    .filter((memory) => hasTag(memory, tag))
    .sort(compareOldestFirst)
    .slice(-count);
}

/** Everything the latest night pass wrote (summary, mood entry, insights), for the morning pass. */
export function selectLatestNightReflections(memories: MemoryReader, agentId: string): Memory[] {
  const [latestSummary] = selectTaggedReflections(memories, agentId, DAY_SUMMARY_TAG, 1);
  if (latestSummary === undefined) return [];
  return memories
    .listByAgentAndBucket(agentId, "reflections")
    .filter((memory) => memory.tick === latestSummary.tick)
    .sort(compareOldestFirst);
}

export function describeReflectionKind(memory: Memory): string {
  if (hasTag(memory, DAY_SUMMARY_TAG)) return "Summary";
  if (hasTag(memory, MOOD_ENTRY_TAG)) return "Mood";
  if (hasTag(memory, INSIGHT_TAG)) return "Insight";
  return "Thought";
}
