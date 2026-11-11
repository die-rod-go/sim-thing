import { BUCKETS, simHoursBetween, type Bucket, type Memory } from "@village/shared";
import { config } from "../config";
import type { MemoryStore } from "./memory-store";
import { extractTags, uniqueTags } from "./tags";

/** Extra relevance for a memory, e.g. embedding similarity to the situation; 0 until embeddings exist. */
export type SimilarityScorer = (memory: Memory) => number;

export interface CueSources {
  place: string;
  aroundAgentNames: readonly string[];
  nearbyEntityNames: readonly string[];
  actionTarget: string | null;
  conversationText: string;
  intention: string;
  knownNames: readonly string[];
}

const HALVING_BASE = 0.5;

const noSimilarity: SimilarityScorer = () => 0;

/**
 * The recall cue: the place, who is around, nearby entities (objects and ground items), the
 * action's target, and known names found in the conversation and intention. The daily plan and goals are deliberately left out.
 */
export function buildCue(sources: CueSources): string[] {
  return uniqueTags([
    sources.place,
    ...sources.aroundAgentNames,
    ...sources.nearbyEntityNames,
    sources.actionTarget,
    ...extractTags(sources.conversationText, sources.knownNames),
    ...extractTags(sources.intention, sources.knownNames),
  ]);
}

function countTagOverlap(memoryTags: readonly string[], cueTags: ReadonlySet<string>): number {
  return memoryTags.filter((tag) => cueTags.has(tag)).length;
}

/** The brief's score: tag overlap share + recency + strength, plus the similarity hook. */
export function scoreMemory(
  memory: Memory,
  cueTags: readonly string[],
  tick: number,
  similarity: SimilarityScorer = noSimilarity,
): number {
  const weights = config.memory.scoreWeights;
  const tagOverlap =
    cueTags.length === 0 ? 0 : countTagOverlap(memory.tags, new Set(cueTags)) / cueTags.length;
  const hoursSince = simHoursBetween(memory.tick, tick, config.clock.minutesPerTick);
  const recency = HALVING_BASE ** (hoursSince / config.memory.recencyHalfLifeHours);
  return (
    weights.tagOverlap * tagOverlap +
    weights.recency * recency +
    weights.strength * memory.strength +
    weights.similarity * similarity(memory)
  );
}

interface ScoredMemory {
  memory: Memory;
  score: number;
}

function compareScored(first: ScoredMemory, second: ScoredMemory): number {
  if (second.score !== first.score) return second.score - first.score;
  if (second.memory.tick !== first.memory.tick) return second.memory.tick - first.memory.tick;
  return first.memory.id.localeCompare(second.memory.id);
}

function scoreAll(
  memories: readonly Memory[],
  cueTags: readonly string[],
  tick: number,
  similarity: SimilarityScorer,
): ScoredMemory[] {
  return memories
    .map((memory) => ({ memory, score: scoreMemory(memory, cueTags, tick, similarity) }))
    .sort(compareScored);
}

function topPerBucket(
  scored: readonly ScoredMemory[],
  limitFor: (bucket: Bucket) => number,
): Record<Bucket, ScoredMemory[]> {
  const result = emptyBuckets<ScoredMemory>();
  for (const entry of scored) {
    const picked = result[entry.memory.bucket];
    if (picked.length < limitFor(entry.memory.bucket)) picked.push(entry);
  }
  return result;
}

function emptyBuckets<Item>(): Record<Bucket, Item[]> {
  return Object.fromEntries(BUCKETS.map((bucket) => [bucket, []])) as unknown as Record<
    Bucket,
    Item[]
  >;
}

function canBump(memory: Memory, tick: number): boolean {
  if (memory.lastRecalledTick === null) return true;
  const hoursSince = simHoursBetween(memory.lastRecalledTick, tick, config.clock.minutesPerTick);
  return hoursSince >= config.memory.recallBumpCooldownHours;
}

/** Strengthens recalled memories in the store, at most once per cooldown each; returns them as stored. */
export function bumpRecalledMemories(
  store: MemoryStore,
  memories: readonly Memory[],
  tick: number,
): Memory[] {
  return memories.map((memory) => {
    if (!canBump(memory, tick)) return memory;
    const bumped: Memory = {
      ...memory,
      strength: Math.min(1, memory.strength + config.memory.recallBump),
      lastRecalledTick: tick,
    };
    store.update(bumped);
    return bumped;
  });
}

/**
 * Picks the top memories per bucket for a decision, then runs an association pass: tags of the
 * top results that weren't in the cue pull in a few more memories sharing them. Every recalled
 * memory is bumped.
 */
export function recallForDecision(
  store: MemoryStore,
  agentId: string,
  cueTags: readonly string[],
  tick: number,
  similarity: SimilarityScorer = noSimilarity,
): Record<Bucket, Memory[]> {
  const memories = store.listByAgent(agentId);
  const firstPass = topPerBucket(
    scoreAll(memories, cueTags, tick, similarity),
    (bucket) => config.memory.recallPerBucket[bucket],
  );
  const firstPicks = BUCKETS.flatMap((bucket) => firstPass[bucket]).sort(compareScored);
  const pickedIds = new Set(firstPicks.map((entry) => entry.memory.id));
  const cueSet = new Set(cueTags);
  const associationTags = uniqueTags(
    firstPicks
      .slice(0, config.memory.associationSeedCount)
      .flatMap((entry) => entry.memory.tags)
      .filter((tag) => !cueSet.has(tag)),
  );
  const associationSet = new Set(associationTags);
  const candidates = memories.filter(
    (memory) => !pickedIds.has(memory.id) && countTagOverlap(memory.tags, associationSet) > 0,
  );
  const secondPass = topPerBucket(
    scoreAll(candidates, [...cueTags, ...associationTags], tick, similarity),
    () => config.memory.associationPerBucket,
  );
  const result = emptyBuckets<Memory>();
  for (const bucket of BUCKETS) {
    const recalled = [...firstPass[bucket], ...secondPass[bucket]].map((entry) => entry.memory);
    result[bucket] = bumpRecalledMemories(store, recalled, tick);
  }
  return result;
}

/**
 * The `recall(query)` action: searches all buckets for memories sharing a known name found in the
 * query, returns the best few and bumps them. A query naming nothing known finds nothing.
 */
export function searchMemories(
  store: MemoryStore,
  agentId: string,
  query: string,
  knownNames: readonly string[],
  tick: number,
  similarity: SimilarityScorer = noSimilarity,
): Memory[] {
  const queryTags = extractTags(query, knownNames);
  if (queryTags.length === 0) return [];
  const queryTagSet = new Set(queryTags);
  const matches = store
    .listByAgent(agentId)
    .filter((memory) => countTagOverlap(memory.tags, queryTagSet) > 0);
  const best = scoreAll(matches, queryTags, tick, similarity)
    .slice(0, config.memory.recallActionResultLimit)
    .map((entry) => entry.memory);
  return bumpRecalledMemories(store, best, tick);
}
