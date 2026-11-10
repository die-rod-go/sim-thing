/** Tags are stored lowercased and trimmed, so "Mara" and "mara" are one tag. */
export function normalizeTag(name: string): string {
  return name.trim().toLowerCase();
}

function escapeRegularExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeWord(text: string, name: string): boolean {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegularExpression(name)}(?![\\p{L}\\p{N}_])`,
    "iu",
  );
  return pattern.test(text);
}

/** Known agent, object and place names found in the text by case-insensitive whole-word match. */
export function extractTags(text: string, knownNames: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const name of knownNames) {
    const tag = normalizeTag(name);
    if (tag.length > 0 && containsWholeWord(text, tag)) tags.add(tag);
  }
  return [...tags];
}

/** Normalizes and de-duplicates tags, dropping empty ones. */
export function uniqueTags(names: readonly (string | null | undefined)[]): string[] {
  const tags = new Set<string>();
  for (const name of names) {
    if (name === null || name === undefined) continue;
    const tag = normalizeTag(name);
    if (tag.length > 0) tags.add(tag);
  }
  return [...tags];
}
