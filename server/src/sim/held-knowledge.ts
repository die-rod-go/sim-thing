import type { Agent } from "@village/shared";
import type { HeldKnowledge } from "../decision/context";
import { describeStreamEntry, describeSummary } from "../memory/stream";
import { getAgentMemory } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * Everything the agent remembers and holds, as prompts read it: its memory from history to
 * stream, its seen places, its goals and its person entries. Decisions and passes show the same.
 */
export function buildHeldKnowledge(state: WorldState, agent: Agent): HeldKnowledge {
  const memory = getAgentMemory(state, agent.id);
  return {
    history: memory.history === null ? null : describeSummary(memory.history),
    daySummary: memory.daySummary === null ? null : describeSummary(memory.daySummary),
    chronicles: memory.chronicles.map(describeSummary),
    episodes: memory.episodes.map(describeSummary),
    stream: memory.stream.map(describeStreamEntry),
    seenPlaces: agent.seenPlaces.map((seenPlace) => ({
      name: seenPlace.name,
      entityNames: seenPlace.entities?.names ?? null,
    })),
    longTermGoals: agent.longTermGoals,
    agenda: agent.agenda,
    keyMemories: memory.keyMemories,
    people: state.agents.flatMap((other) => {
      const entry = agent.people[other.id];
      return entry === undefined ? [] : [{ name: other.name, pronouns: other.pronouns, entry }];
    }),
  };
}
