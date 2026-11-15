import { config } from "../config";

const { ignoredWords } = config.places.walkNameMatch;

function reduceWord(word: string): string {
  const withoutPossessive = word.replace(/'s?$/, "");
  const isPlural = withoutPossessive.length > 3 && /[^s]s$/.test(withoutPossessive);
  return isPlural ? withoutPossessive.slice(0, -1) : withoutPossessive;
}

/** The words a name is matched on: "The butcher's back doors" → butcher, back, door. */
export function listNameWords(name: string): Set<string> {
  const words = name.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return new Set(
    words.map(reduceWord).filter((word) => word !== "" && !ignoredWords.includes(word)),
  );
}

/** How alike two names are, 0 to 1: the words they share over all the words either has. */
export function scoreNameMatch(wanted: string, candidate: string): number {
  const wantedWords = listNameWords(wanted);
  const candidateWords = listNameWords(candidate);
  const sharedCount = [...wantedWords].filter((word) => candidateWords.has(word)).length;
  const allCount = new Set([...wantedWords, ...candidateWords]).size;
  return allCount === 0 ? 0 : sharedCount / allCount;
}
