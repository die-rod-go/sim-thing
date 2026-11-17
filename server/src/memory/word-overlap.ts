/** The lowercase words of a text, letters and digits only: "Pay me, Nastya!" → pay, me, nastya. */
export function listWords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
}

/** How alike two texts are, 0 to 1: the words they share over all the words either has. */
export function measureWordOverlap(first: string, second: string): number {
  const firstWords = listWords(first);
  const secondWords = listWords(second);
  const sharedCount = [...firstWords].filter((word) => secondWords.has(word)).length;
  const allCount = new Set([...firstWords, ...secondWords]).size;
  return allCount === 0 ? 0 : sharedCount / allCount;
}
