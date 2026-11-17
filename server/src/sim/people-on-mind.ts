import type { Agent } from "@village/shared";
import { config } from "../config";
import type { KnownPerson } from "../decision/context";
import { computeChebyshevDistance } from "../economy/give";
import { isOwnNameMentioned } from "../perception/interrupts";
import { getAgentRuntime } from "./agent-runtime";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** Who the agent has been talking with lately, the most recent first. */
function listConversationPartnerIds(state: WorldState, agentId: string): string[] {
  const windowTicks = config.memory.participationWindowTicks;
  return state.conversationLog.lines
    .filter((line) => state.tick - line.tick <= windowTicks)
    .reverse()
    .flatMap((line) => {
      if (line.speakerId === agentId) return line.clearListenerIds;
      return line.clearListenerIds.includes(agentId) ? [line.speakerId] : [];
    });
}

function listVisibleIdsNearestFirst(state: WorldState, agent: Agent): string[] {
  const distanceTo = (otherId: string) =>
    computeChebyshevDistance(agent.pos, findAgent(state, otherId).pos);
  return [...getAgentRuntime(state, agent.id).visibleAgentIds].sort(
    (first, second) => distanceTo(first) - distanceTo(second),
  );
}

/**
 * The people whose full entries a decision shows: those in the conversation, then those in sight,
 * nearest first, then those named in `namingTexts` (the intention), at most `people.fullEntriesMax`.
 * Only people the agent holds an entry for.
 */
export function listPeopleOnMind(
  state: WorldState,
  agent: Agent,
  namingTexts: readonly string[],
): KnownPerson[] {
  const namedIds = state.agents
    .filter((other) => namingTexts.some((text) => isOwnNameMentioned(text, other.name)))
    .map((other) => other.id);
  const candidateIds = [
    ...listConversationPartnerIds(state, agent.id),
    ...listVisibleIdsNearestFirst(state, agent),
    ...namedIds,
  ];
  return [...new Set(candidateIds)]
    .filter((otherId) => otherId !== agent.id && agent.people[otherId] !== undefined)
    .slice(0, config.people.fullEntriesMax)
    .map((otherId) => {
      const other = findAgent(state, otherId);
      const entry = agent.people[otherId];
      if (entry === undefined) throw new Error(`${agent.name} holds no entry for ${other.name}`);
      return { name: other.name, pronouns: other.pronouns, entry };
    });
}
