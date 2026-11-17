import { toSimTime } from "@village/shared";
import { config } from "../config";
import { oweReflection } from "../memory/reflection-progress";
import { appendToStream, getAgentMemory } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * A moment for the agent's next reflection to keep as a key memory or let go: from an episode, or
 * one a decision marked. The oldest go first past `memory.keyMemoryCandidatesMax`.
 */
export function addKeyMemoryCandidate(state: WorldState, agentId: string, text: string): void {
  const memory = getAgentMemory(state, agentId);
  const day = toSimTime(state.tick, config.clock).day;
  const candidates = [...memory.keyMemoryCandidates, { day, text }].slice(
    -config.memory.keyMemoryCandidatesMax,
  );
  state.agentMemories[agentId] = { ...memory, keyMemoryCandidates: candidates };
}

/**
 * A moment a decision marked to remember: it goes into the stream at once, waits as a key memory
 * candidate, and the agent owes a reflection, which decides whether it lasts.
 */
export function markToRemember(state: WorldState, agentId: string, text: string): void {
  appendToStream(state, agentId, config.memory.rememberText.split("{text}").join(text));
  addKeyMemoryCandidate(state, agentId, text);
  state.agentMemories[agentId] = oweReflection(getAgentMemory(state, agentId));
}
