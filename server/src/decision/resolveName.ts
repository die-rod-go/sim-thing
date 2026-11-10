export interface NamedCandidate {
  id: string;
  name: string;
}

/** Lowercase, trimmed, single-spaced, without a leading "the ": "The  Bakery " → "bakery". */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/^the /, "");
}

/** Maps a display name the agent wrote to an id, case-insensitively; null if nothing matches. */
export function resolveName(name: string, candidates: readonly NamedCandidate[]): string | null {
  const wanted = normalizeDisplayName(name);
  if (wanted === "") return null;
  const match = candidates.find((candidate) => normalizeDisplayName(candidate.name) === wanted);
  return match?.id ?? null;
}
