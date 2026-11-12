import { config } from "../config";
import type { Memory } from "@village/shared";

/** Extra relevance for a memory, 0..1: how well its words match the situation. */
export type SimilarityScorer = (memory: Memory) => number;

const stopWords: ReadonlySet<string> = new Set(config.memory.similarity.stopWords);

function stem(word: string): string {
  const { minStemLength, stemSuffixes } = config.memory.similarity;
  for (const suffix of stemSuffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= minStemLength) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/** Lowercased words without stop words or short words, crudely stemmed, each once. */
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= config.memory.similarity.minWordLength)
    .filter((word) => !stopWords.has(word));
  return new Set(words.map(stem));
}

/**
 * Scores memories by the share of the cue's words they contain, rare words counting more. Word
 * rarity is measured over the given memories, so common words matter little.
 */
export function createLexicalSimilarity(
  cueText: string,
  memories: readonly Memory[],
): SimilarityScorer {
  const cueTerms = [...tokenize(cueText)];
  if (cueTerms.length === 0) return () => 0;
  const memoryTokens = new Map(memories.map((memory) => [memory.id, tokenize(memory.text)]));
  const weights = new Map(
    cueTerms.map((term) => {
      const documentFrequency = [...memoryTokens.values()].filter((tokens) =>
        tokens.has(term),
      ).length;
      return [term, Math.log(1 + memories.length / Math.max(1, documentFrequency))];
    }),
  );
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  return (memory) => {
    const tokens = memoryTokens.get(memory.id) ?? tokenize(memory.text);
    const shared = cueTerms
      .filter((term) => tokens.has(term))
      .reduce((sum, term) => sum + (weights.get(term) ?? 0), 0);
    return totalWeight === 0 ? 0 : shared / totalWeight;
  };
}
