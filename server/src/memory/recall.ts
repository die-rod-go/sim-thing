import { BUCKETS, simHoursBetween, type Bucket, type Memory } from "@village/shared";
import { config } from "../config";
import type { MemoryStore } from "./memory-store";
import { ELLIPSIS } from "./filing";
import { createLexicalSimilarity, type SimilarityScorer } from "./similarity";
import { extractTags, uniqueTags } from "./tags";

export type { SimilarityScorer };

export interface CueSources {
  place: string;
  aroundAgentNames: readonly string[];
  nearbyEntityNames: readonly string[];
  actionTarget: string | null;
  conversationText: string;
  intention: string;
  dailyPlan: string;
  goalsText: string;
  /** Plan aims and next steps. */
  plansText: string;
  knownNames: readonly string[];
}

export interface CueTextSources {
  intention: string;
  dailyPlan: string;
  decisionReason: string | null;
  goalsText: string;
  plansText: string;
  conversationLines: readonly string[];
}

const HALVING_BASE = 0.5;

/**
 * The recall cue: the place, who is around, nearby entities (objects and ground items), the
 * action's target, and known names found in the conversation, intention, daily plan and goals.
 */
export function buildCue(sources: CueSources): string[] {
  return uniqueTags([
    sources.place,
    ...sources.aroundAgentNames,
    ...sources.nearbyEntityNames,
    sources.actionTarget,
    ...extractTags(sources.conversationText, sources.knownNames),
    ...extractTags(sources.intention, sources.knownNames),
    ...extractTags(sources.dailyPlan, sources.knownNames),
    ...extractTags(sources.goalsText, sources.knownNames),
    ...extractTags(sources.plansText, sources.knownNames),
  ]);
}

/** The free text of the recall cue: what the agent is after, matched against memories by words. */
export function buildCueText(sources: CueTextSources): string {
  return [
    sources.intention,
    sources.dailyPlan,
    sources.decisionReason ?? "",
    sources.goalsText,
    sources.plansText,
    ...sources.conversationLines.slice(-config.memory.cueConversationLines),
  ].join("\n");
}

function normalizeWords(text: string): string {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .join(" ");
}

/** The normalized words inside each pair of double quotes; a final quote left open is included. */
function listQuotedWords(text: string): string[] {
  return [...text.matchAll(/"([^"]+)(?:"|$)/g)].map((match) => normalizeWords(match[1] ?? ""));
}

/**
 * Whether the text quotes one of the conversation lines, comparing words rather than formatting.
 * A memory cut short with an ellipsis matches when its words begin a line.
 */
export function repeatsConversationLine(
  text: string,
  conversationWords: readonly string[],
): boolean {
  if (conversationWords.length === 0) return false;
  const lines = conversationWords.map(normalizeWords);
  const isTruncated = text.trimEnd().endsWith(ELLIPSIS);
  return listQuotedWords(text).some((quoted) =>
    lines.some(
      (line) => line === quoted || (isTruncated && quoted !== "" && line.startsWith(quoted)),
    ),
  );
}

function countTagOverlap(memoryTags: readonly string[], cueTags: ReadonlySet<string>): number {
  return memoryTags.filter((tag) => cueTags.has(tag)).length;
}

/** The brief's score: tag overlap share + recency + strength, plus the similarity hook. */
export function scoreMemory(
  memory: Memory,
  cueTags: readonly string[],
  tick: number,
  similarity: SimilarityScorer = () => 0,
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

function groupByBucket(entries: readonly ScoredMemory[]): Record<Bucket, ScoredMemory[]> {
  const result = emptyBuckets<ScoredMemory>();
  for (const entry of entries) result[entry.memory.bucket].push(entry);
  return result;
}

export interface RecallOptions {
  /** Free text of the cue; memories sharing its words score higher. */
  cueText?: string;
  /** Lines of the current conversation, which recalled memories must not repeat. */
  conversationWords?: readonly string[];
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
 * Picks the top memories per bucket for a decision and keeps the best few overall, then runs an
 * association pass: tags of the top results that weren't in the cue pull in a few more memories
 * sharing them. Every recalled memory is bumped.
 */
export function recallForDecision(
  store: MemoryStore,
  agentId: string,
  cueTags: readonly string[],
  tick: number,
  options: RecallOptions = {},
): Record<Bucket, Memory[]> {
  const conversationWords = options.conversationWords ?? [];
  const memories = store
    .listByAgent(agentId)
    .filter((memory) => !repeatsConversationLine(memory.text, conversationWords));
  const similarity = createLexicalSimilarity(options.cueText ?? "", memories);
  const perBucket = topPerBucket(
    scoreAll(memories, cueTags, tick, similarity),
    (bucket) => config.memory.recallPerBucket[bucket],
  );
  const firstPicks = BUCKETS.flatMap((bucket) => perBucket[bucket])
    .sort(compareScored)
    .slice(0, config.memory.recallTotal);
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
  const associated = scoreAll(candidates, [...cueTags, ...associationTags], tick, similarity).slice(
    0,
    config.memory.associationTotal,
  );
  const grouped = groupByBucket([...firstPicks, ...associated]);
  const result = emptyBuckets<Memory>();
  for (const bucket of BUCKETS) {
    result[bucket] = bumpRecalledMemories(
      store,
      grouped[bucket].map((entry) => entry.memory),
      tick,
    );
  }
  return result;
}

/**
 * The best few of the ranked matches, each bucket's best placed first, so one bucket's many
 * retellings of a topic can't crowd out a lone matching memory from another.
 */
function pickBestPerBucketFirst(ranked: readonly ScoredMemory[], limit: number): ScoredMemory[] {
  const bucketLeaders = BUCKETS.flatMap((bucket) =>
    ranked.filter((entry) => entry.memory.bucket === bucket).slice(0, 1),
  )
    .sort(compareScored)
    .slice(0, limit);
  const leaderIds = new Set(bucketLeaders.map((entry) => entry.memory.id));
  const rest = ranked.filter((entry) => !leaderIds.has(entry.memory.id));
  return [...bucketLeaders, ...rest].slice(0, limit).sort(compareScored);
}

/**
 * The `recall(query)` action: searches all buckets for memories that share a known name found in
 * the query or whose words resemble the query's, returns the best few and bumps them.
 */
export function searchMemories(
  store: MemoryStore,
  agentId: string,
  query: string,
  knownNames: readonly string[],
  tick: number,
): Memory[] {
  const queryTags = extractTags(query, knownNames);
  const queryTagSet = new Set(queryTags);
  const memories = store.listByAgent(agentId);
  const similarity = createLexicalSimilarity(query, memories);
  const matches = memories.filter(
    (memory) =>
      countTagOverlap(memory.tags, queryTagSet) > 0 ||
      similarity(memory) >= config.memory.recallActionMinSimilarity,
  );
  const best = pickBestPerBucketFirst(
    scoreAll(matches, queryTags, tick, similarity),
    config.memory.recallActionResultLimit,
  ).map((entry) => entry.memory);
  return bumpRecalledMemories(store, best, tick);
}
