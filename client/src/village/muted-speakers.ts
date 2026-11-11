/** Agents whose speech bubbles this viewer has hidden. Their conversations go on regardless. */
export type MutedSpeakers = ReadonlySet<string>;

export function toggleMutedSpeaker(muted: MutedSpeakers, agentId: string): MutedSpeakers {
  const next = new Set(muted);
  if (next.has(agentId)) next.delete(agentId);
  else next.add(agentId);
  return next;
}

export function parseMutedSpeakers(raw: string | null): MutedSpeakers | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    // A corrupt stored value only means nobody is muted, the default.
    return null;
  }
}

export function serializeMutedSpeakers(muted: MutedSpeakers): string {
  return JSON.stringify([...muted]);
}
