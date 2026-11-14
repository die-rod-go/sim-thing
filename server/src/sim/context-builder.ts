import { formatSimTime, readAgentHealth, type Agent } from "@village/shared";
import { config } from "../config";
import type { AwarenessEntry, DecisionContext, DecisionTargets } from "../decision/context";
import { listPeopleOnMind } from "../decision/people-on-mind";
import { computeChebyshevDistance } from "../economy/give";
import { describeStreamEntry } from "../memory/stream";
import { findObviousListeners } from "../perception/listeners";
import { listBodyWords } from "../status/conditions";
import { computeStarvationDamage, describeHealthAsSeen, isDead } from "../status/health";
import { describeDoing } from "./action-phrases";
import { getAgentRuntime } from "./agent-runtime";
import {
  buildBelongings,
  buildHere,
  listAimOnlyTargets,
  listItemlessVerbNames,
  listVisibleCarried,
  listNearbyEntityNames,
  listValidHolders,
  listValidItems,
} from "./prompt-entities";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  getAgentMemory,
  listLivingAgents,
  toPerceiver,
} from "./world-access";
import type { WorldState } from "./world-state";

const { minutesPerTick } = config.clock;

function minutesSince(tick: number, nowTick: number): number {
  return (nowTick - tick) * minutesPerTick;
}

function buildAwarenessEntries(state: WorldState, agent: Agent): AwarenessEntry[] {
  const visibleIds = new Set(getAgentRuntime(state, agent.id).visibleAgentIds);
  return Object.values(agent.awareness).flatMap((entry) => {
    const other = state.agents.find((candidate) => candidate.id === entry.agentId);
    if (!other) return [];
    const isInSight = visibleIds.has(entry.agentId);
    return [
      {
        agentId: entry.agentId,
        name: other.name,
        via: entry.via,
        place: entry.place,
        doing: entry.doing,
        minutesAgo: minutesSince(entry.tick, state.tick),
        isInSight,
        isDead: isInSight && isDead(other),
        distanceTiles: isInSight ? computeChebyshevDistance(agent.pos, other.pos) : null,
        healthAsSeen:
          isInSight && !isDead(other)
            ? describeHealthAsSeen(readAgentHealth(state.items, other))
            : null,
        visibleCarried: isInSight && !isDead(other) ? listVisibleCarried(state, other) : [],
        visibleConditions: isInSight ? listBodyWords(state.items, other, true) : [],
      },
    ];
  });
}

export function buildValidTargets(state: WorldState, agent: Agent): DecisionTargets {
  const visibleIds = getAgentRuntime(state, agent.id).visibleAgentIds;
  return {
    places: state.map.places.map((place) => place.name),
    agents: visibleIds.map((agentId) => describeAgentAsSeen(findAgent(state, agentId))),
    entities: listNearbyEntityNames(state, agent),
    aimOnly: listAimOnlyTargets(state, agent),
  };
}

/**
 * Step 1 of a decision: everything the agent knows right now, from its own state, its awareness,
 * its seen places and its stream. `decisionReason` is what flagged the decision, as perceived.
 */
export function buildDecisionContext(
  state: WorldState,
  agentId: string,
  isMidActionInterrupt: boolean,
  decisionReason: string | null = null,
): DecisionContext {
  const agent = findAgent(state, agentId);
  const runtime = getAgentRuntime(state, agentId);
  const world = buildPerceptionWorld(state);
  const listeners = findObviousListeners(
    world,
    toPerceiver(agent),
    listLivingAgents(state)
      .filter((other) => other.id !== agentId)
      .map(toPerceiver),
  );
  const aroundYouEntries = buildAwarenessEntries(state, agent);
  const nearbyEntities = buildHere(state, agent);
  const action = agent.currentAction;
  return {
    name: agent.name,
    profession: agent.profession,
    personality: agent.personality,
    mood: agent.mood,
    needs: agent.needs,
    health: readAgentHealth(state.items, agent),
    isStarvationHarming: computeStarvationDamage(agent, state.tick, minutesPerTick) > 0,
    conditionWords: listBodyWords(state.items, agent, false),
    body: agent.body,
    goals: agent.goals,
    intention: agent.intention,
    simTime: formatSimTime(state.tick, config.clock),
    place: agent.place,
    nearbyEntities,
    aroundYou: {
      entries: aroundYouEntries,
      normalHearerIds: listeners.wouldHearNormal,
      whisperHearerIds: listeners.wouldHearWhisper,
    },
    peopleOnMind: listPeopleOnMind({
      others: state.agents
        .filter((other) => other.id !== agentId)
        .map((other) => ({ id: other.id, name: other.name })),
      dossiers: agent.dossiers,
      inSightIds: runtime.visibleAgentIds,
      mentioningTexts: [agent.intention, ...agent.goals.map((goal) => goal.text)],
    }),
    belongings: buildBelongings(state, agent),
    itemlessVerbs: listItemlessVerbNames(state),
    stream: getAgentMemory(state, agentId).stream.map(describeStreamEntry),
    seenPlaces: agent.seenPlaces.map((seenPlace) => ({
      name: seenPlace.name,
      entityNames: seenPlace.entities?.names ?? null,
      seenAt:
        seenPlace.entities === null || seenPlace.entities.tick === state.tick
          ? null
          : formatSimTime(seenPlace.entities.tick, config.clock),
    })),
    currentAction:
      action === null
        ? null
        : {
            description: describeDoing(state, agent, runtime),
            minutesLeft:
              action.endsAtTick === null ? null : minutesSince(state.tick, action.endsAtTick),
            slowedBy: runtime.verbRun?.slowedBy ?? null,
          },
    isMidActionInterrupt,
    decisionReason,
    lastFailure: runtime.lastFailure,
    validTargets: buildValidTargets(state, agent),
    validItems: listValidItems(state, agent),
    validHolders: listValidHolders(state, agent),
  };
}
