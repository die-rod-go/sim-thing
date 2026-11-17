import { config } from "../config";

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites a text so texts that differ only by who or how many group together: every name becomes
 * `measure.namePlaceholder` and every number `measure.numberPlaceholder`.
 */
export function buildNameGrouper(names: readonly string[]): (text: string) => string {
  const longestFirst = [...new Set(names)]
    .filter((name) => name.trim() !== "")
    .sort((first, second) => second.length - first.length);
  const namePattern =
    longestFirst.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}_])(${longestFirst.map(escapeForPattern).join("|")})(?![\\p{L}\\p{N}_])`,
          "gu",
        );
  return (text) => {
    const withoutNames =
      namePattern === null ? text : text.replace(namePattern, config.measure.namePlaceholder);
    return withoutNames.replace(/\d+/g, config.measure.numberPlaceholder);
  };
}
