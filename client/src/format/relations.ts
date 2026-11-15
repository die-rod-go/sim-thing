import type { Agent, Awareness, PersonEntry } from "@village/shared";
import type { ConversationThread } from "./conversations";

export interface Relation {
  agentId: string;
  name: string;
  profession: string;
  awareness: Awareness | null;
  /** Sim-minutes since last perceived; null when never perceived. */
  minutesSincePerceived: number | null;
  /** What the agent holds about this person; null when it has never seen them. */
  entry: PersonEntry | null;
  /** Conversation threads in the recent event window where both spoke. */
  sharedThreadCount: number;
}

/** Everyone else in the village from the agent's point of view, most recently perceived first. */
export function buildRelations(
  agent: Agent,
  allAgents: Agent[],
  threads: ConversationThread[],
  currentTick: number,
  minutesPerTick: number,
): Relation[] {
  const relations = allAgents
    .filter((other) => other.id !== agent.id)
    .map((other): Relation => {
      const awareness = agent.awareness[other.id] ?? null;
      return {
        agentId: other.id,
        name: other.name,
        profession: other.profession,
        awareness,
        minutesSincePerceived:
          awareness === null ? null : Math.max(0, (currentTick - awareness.tick) * minutesPerTick),
        entry: agent.people[other.id] ?? null,
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
