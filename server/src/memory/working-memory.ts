import { config } from "../config";

/** Appends an entry and keeps only the most recent `size` entries. */
export function pushWorkingMemory(
  entries: readonly string[],
  entry: string,
  size: number = config.memory.workingMemorySize,
): string[] {
  if (size <= 0) return [];
  return [...entries, entry].slice(-size);
}
