import type { Agent, Awareness, Memory } from "@village/shared";
import type { ConversationThread } from "./conversations";

export interface Relation {
  agentId: string;
  name: string;
  profession: string;
  awareness: Awareness | null;
  /** Sim-minutes since last perceived; null when never perceived. */
  minutesSincePerceived: number | null;
  /** The agent's own `people` notes about this person, newest first. */
  personNotes: Memory[];
  /** How many of the agent's memories are tagged with this person. */
  memoryCount: number;
  /** Conversation threads in the recent event window where both spoke. */
  sharedThreadCount: number;
}

/** Memory tags are lowercased names, as the server's tagging stores them. */
function toTag(name: string): string {
  return name.trim().toLowerCase();
}

/** Everyone else in the village from the agent's point of view, most recently perceived first. */
export function buildRelations(
  agent: Agent,
  allAgents: Agent[],
  memories: Memory[],
  threads: ConversationThread[],
  currentTick: number,
  minutesPerTick: number,
): Relation[] {
  const relations = allAgents
    .filter((other) => other.id !== agent.id)
    .map((other): Relation => {
      const tag = toTag(other.name);
      const taggedMemories = memories.filter((memory) => memory.tags.includes(tag));
      const awareness = agent.awareness[other.id] ?? null;
      return {
        agentId: other.id,
        name: other.name,
        profession: other.profession,
        awareness,
        minutesSincePerceived:
          awareness === null ? null : Math.max(0, (currentTick - awareness.tick) * minutesPerTick),
        personNotes: taggedMemories
          .filter((memory) => memory.bucket === "people")
          .sort((first, second) => second.tick - first.tick),
        memoryCount: taggedMemories.length,
        sharedThreadCount: threads.filter(
          (thread) => thread.speakerIds.includes(agent.id) && thread.speakerIds.includes(other.id),
        ).length,
      };
    });
  return relations.sort(compareByRecency);
}

function compareByRecency(first: Relation, second: Relation): number {
  if (first.minutesSincePerceived === second.minutesSincePerceived) {
    return first.name.localeCompare(second.name);
  }
  if (first.minutesSincePerceived === null) return 1;
  if (second.minutesSincePerceived === null) return -1;
  return first.minutesSincePerceived - second.minutesSincePerceived;
}
