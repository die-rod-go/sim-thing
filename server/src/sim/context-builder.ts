import { BUCKETS, formatSimTime, type Agent, type Bucket } from "@village/shared";
import { config } from "../config";
import { describeObjectCondition } from "../economy/object-state";
import type {
  AwarenessEntry,
  DecisionContext,
  DecisionTargets,
  NearbyObject,
  RecalledMemory,
} from "../decision/context";
import { currentConversation } from "../memory/conversation";
import { buildCue, recallForDecision } from "../memory/recall";
import { findObviousListeners } from "../perception/listeners";
import { describeDoing } from "./action-phrases";
import { getAgentRuntime } from "./agent-runtime";
import { buildPerceptionWorld, findAgent, listKnownNames, toPerceiver } from "./world-access";
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
    return [
      {
        agentId: entry.agentId,
        name: other.name,
        via: entry.via,
        place: entry.place,
        doing: entry.doing,
        minutesAgo: minutesSince(entry.tick, state.tick),
        isInSight: visibleIds.has(entry.agentId),
      },
    ];
  });
}

export function listNearbyObjects(state: WorldState, agent: Agent): NearbyObject[] {
  return state.objects
    .filter((object) => object.place === agent.place)
    .map((object) => ({
      name: object.name,
      interactions: config.objects[object.kind].interactions,
      condition: describeObjectCondition(object),
    }));
}

export function listHeldItemsWithUses(agent: Agent): string[] {
  return Object.entries(agent.inventory)
    .filter(([item, count]) => count > 0 && config.heldItems[item] !== undefined)
    .map(([item]) => item);
}

export function buildValidTargets(state: WorldState, agent: Agent): DecisionTargets {
  const visibleIds = getAgentRuntime(state, agent.id).visibleAgentIds;
  return {
    places: state.map.places.map((place) => place.name),
    agents: visibleIds.map((agentId) => findAgent(state, agentId).name),
    objects: listNearbyObjects(state, agent).map((object) => object.name),
    heldItems: listHeldItemsWithUses(agent),
  };
}

function recallMemories(
  state: WorldState,
  agent: Agent,
  aroundYou: AwarenessEntry[],
  nearbyObjects: NearbyObject[],
  conversationText: string,
): Partial<Record<Bucket, RecalledMemory[]>> {
  const cue = buildCue({
    place: agent.place,
    aroundAgentNames: aroundYou
      .filter((entry) => entry.minutesAgo <= config.perception.awarenessPromptWindowMinutes)
      .map((entry) => entry.name),
    nearbyObjectNames: nearbyObjects.map((object) => object.name),
    actionTarget: agent.currentAction?.target ?? null,
    conversationText,
    intention: agent.intention,
    knownNames: listKnownNames(state),
  });
  const recalled = recallForDecision(state.memoryStore, agent.id, cue, state.tick);
  return Object.fromEntries(
    BUCKETS.map((bucket) => [
      bucket,
      recalled[bucket].map((memory) => ({
        text: memory.text,
        minutesAgo: minutesSince(memory.tick, state.tick),
      })),
    ]),
  );
}

/**
 * Step 1 of a decision: everything the agent knows right now, from its own state, its awareness,
 * the current conversation and recalled memories. `agentOverride` lets a re-decision after
 * `recall` see the updated working memory.
 */
export function buildDecisionContext(
  state: WorldState,
  agentId: string,
  isMidActionInterrupt: boolean,
  agentOverride?: Agent,
): DecisionContext {
  const agent = agentOverride ?? findAgent(state, agentId);
  const runtime = getAgentRuntime(state, agentId);
  const world = buildPerceptionWorld(state);
  const listeners = findObviousListeners(
    world,
    toPerceiver(agent),
    state.agents.filter((other) => other.id !== agentId).map(toPerceiver),
  );
  const aroundYouEntries = buildAwarenessEntries(state, agent);
  const nearbyObjects = listNearbyObjects(state, agent);
  const conversation = currentConversation(state.conversationLog, agentId, state.tick);
  const conversationText = conversation.map((line) => line.words).join(" ");
  const action = agent.currentAction;
  return {
    name: agent.name,
    profession: agent.profession,
    personality: agent.personality,
    mood: agent.mood,
    needs: agent.needs,
    goals: agent.goals,
    dailyPlan: agent.dailyPlan,
    intention: agent.intention,
    simTime: formatSimTime(state.tick, config.clock),
    place: agent.place,
    nearbyObjects,
    aroundYou: {
      entries: aroundYouEntries,
      normalHearerIds: listeners.wouldHearNormal,
      whisperHearerIds: listeners.wouldHearWhisper,
    },
    coins: agent.coins,
    inventory: agent.inventory,
    workingMemory: agent.workingMemory,
    conversation: conversation.map((line) => ({
      speakerName: line.speakerName,
      words: line.words,
      minutesAgo: minutesSince(line.tick, state.tick),
    })),
    recalledMemories: recallMemories(
      state,
      agent,
      aroundYouEntries,
      nearbyObjects,
      conversationText,
    ),
    knownPlaces: state.map.places.map((place) => place.name),
    currentAction:
      action === null
        ? null
        : {
            description: describeDoing(state, agent, runtime),
            minutesLeft:
              action.endsAtTick === null ? null : minutesSince(state.tick, action.endsAtTick),
          },
    isMidActionInterrupt,
    lastFailure: runtime.lastFailure,
    validTargets: buildValidTargets(state, agent),
  };
}
