import { BUCKETS, formatSimTime, readAgentHealth, type Agent, type Bucket } from "@village/shared";
import { config } from "../config";
import type {
  AwarenessEntry,
  DecisionContext,
  DecisionTargets,
  RecalledMemory,
} from "../decision/context";
import { listPeopleOnMind } from "../decision/people-on-mind";
import { describePlanFocus, describePlanText } from "../memory/plans";
import { currentConversation, OWN_SPEAKER_NAME } from "../memory/conversation";
import {
  buildCue,
  buildCueText,
  recallForDecision,
  repeatsConversationLine,
} from "../memory/recall";
import { findObviousListeners } from "../perception/listeners";
import { listBodyWords } from "../status/conditions";
import { describeHealthAsSeen, isDead } from "../status/health";
import { findFailedRecall, readStatusView } from "../status/impairment";
import { describeDoing } from "./action-phrases";
import { getAgentRuntime } from "./agent-runtime";
import {
  buildBelongings,
  buildHere,
  listAimOnlyTargets,
  listItemlessVerbNames,
  listVisibleCarried,
  listNearbyEntityNames,
  listNearbyThingNames,
  listValidHolders,
  listValidItems,
} from "./prompt-entities";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  formatWorkingMemoryEntry,
  listKnownNames,
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

function recallMemories(
  state: WorldState,
  agent: Agent,
  aroundYou: AwarenessEntry[],
  nearbyEntityNames: string[],
  conversationLines: readonly string[],
  decisionReason: string | null,
): Partial<Record<Bucket, RecalledMemory[]>> {
  const goalsText = agent.goals.map((goal) => goal.text).join(" ");
  const cue = buildCue({
    place: agent.place,
    aroundAgentNames: aroundYou
      .filter((entry) => entry.minutesAgo <= config.perception.awarenessPromptWindowMinutes)
      .map((entry) => entry.name),
    nearbyEntityNames,
    actionTarget: agent.currentAction?.target ?? null,
    conversationText: conversationLines.join(" "),
    intention: agent.intention,
    dailyPlan: agent.dailyPlan,
    goalsText,
    plansText: describePlanFocus(agent.plans),
    knownNames: listKnownNames(state),
  });
  const cueText = buildCueText({
    intention: agent.intention,
    dailyPlan: agent.dailyPlan,
    decisionReason,
    goalsText,
    plansText: describePlanFocus(agent.plans),
    conversationLines,
  });
  const recalled = recallForDecision(state.memoryStore, agent.id, cue, state.tick, {
    cueText,
    conversationWords: conversationLines,
  });
  const onMind = new Set(agent.workingMemory);
  return Object.fromEntries(
    BUCKETS.map((bucket) => [
      bucket,
      recalled[bucket]
        .filter((memory) => !onMind.has(formatWorkingMemoryEntry(memory.tick, memory.text)))
        .map((memory) => ({
          text: memory.text,
          minutesAgo: minutesSince(memory.tick, state.tick),
        })),
    ]),
  );
}

export interface DecisionContextOptions {
  /** Lets a re-decision after `recall` see the updated working memory. */
  agentOverride?: Agent;
  /** Below the agent's recall fog chance, no memories come to mind; left out, they always do. */
  passiveRecallRoll?: number;
  /** What flagged the decision, shown to the agent as it was perceived. */
  decisionReason?: string | null;
}

/** A roll no chance is above, for a context built without one. */
const CLEAR_MIND_ROLL = 1;

/**
 * Step 1 of a decision: everything the agent knows right now, from its own state, its awareness,
 * the current conversation and recalled memories (unless a pressing need or wound fogs them out).
 */
export function buildDecisionContext(
  state: WorldState,
  agentId: string,
  isMidActionInterrupt: boolean,
  options: DecisionContextOptions = {},
): DecisionContext {
  const agent = options.agentOverride ?? findAgent(state, agentId);
  const fog = findFailedRecall(
    readStatusView(state.items, agent),
    options.passiveRecallRoll ?? CLEAR_MIND_ROLL,
  );
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
  const conversation = currentConversation(state.conversationLog, agentId, state.tick);
  const conversationLines = conversation.map((line) => line.words);
  const action = agent.currentAction;
  return {
    name: agent.name,
    profession: agent.profession,
    personality: agent.personality,
    mood: agent.mood,
    needs: agent.needs,
    health: readAgentHealth(state.items, agent),
    conditionWords: listBodyWords(state.items, agent, false),
    body: agent.body,
    goals: agent.goals,
    dailyPlan: agent.dailyPlan,
    plans: agent.plans,
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
      speakerNames: conversation
        .map((line) => line.speakerName)
        .filter((speakerName) => speakerName !== OWN_SPEAKER_NAME),
      mentioningTexts: [
        agent.intention,
        agent.dailyPlan,
        ...agent.goals.map((goal) => goal.text),
        ...describePlanText(agent.plans),
        ...conversationLines,
      ],
    }),
    belongings: buildBelongings(state, agent),
    itemlessVerbs: listItemlessVerbNames(state),
    workingMemory: agent.workingMemory.filter(
      (entry) => !repeatsConversationLine(entry, conversationLines),
    ),
    conversation: conversation.map((line) => ({
      speakerName: line.speakerName,
      words: line.words,
      minutesAgo: minutesSince(line.tick, state.tick),
    })),
    recalledMemories:
      fog === null
        ? recallMemories(
            state,
            agent,
            aroundYouEntries,
            listNearbyThingNames(state, agent),
            conversationLines,
            options.decisionReason ?? null,
          )
        : {},
    foggedBy: fog?.statusWords ?? null,
    knownPlaces: state.map.places.map((place) => place.name),
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
    decisionReason: options.decisionReason ?? null,
    lastFailure: runtime.lastFailure,
    validTargets: buildValidTargets(state, agent),
    validItems: listValidItems(state, agent),
    validHolders: listValidHolders(state, agent),
  };
}
