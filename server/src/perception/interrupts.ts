import { config } from "../config";

/** Agent ids visible now that were not visible on the previous tick. */
export function detectNewPerceptions(
  previousVisibleAgentIds: Iterable<string>,
  currentVisibleAgentIds: Iterable<string>,
): string[] {
  const previousIds = new Set(previousVisibleAgentIds);
  return [...new Set(currentVisibleAgentIds)].filter((agentId) => !previousIds.has(agentId));
}

/** Perception interrupts give an agent a new decision at most once per cooldown. */
export function canInterrupt(lastInterruptTick: number | null, tick: number): boolean {
  if (lastInterruptTick === null) return true;
  return tick - lastInterruptTick >= config.perception.interruptCooldownTicks;
}

function escapeRegularExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive match, so "Bob" matches "bob!" but not "Bobby". */
export function isOwnNameMentioned(words: string, name: string): boolean {
  const trimmedName = name.trim();
  if (trimmedName === "") return false;
  const namePattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegularExpression(trimmedName)}(?![\\p{L}\\p{N}_])`,
    "iu",
  );
  return namePattern.test(words);
}
