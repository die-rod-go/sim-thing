import type { Bucket, DecisionAction } from "@village/shared";
import { config } from "../config";
import { fillTemplate, loadTemplate } from "../llm/templates";
import type { TemplateValues } from "../llm/templates";
import { describeAroundYou } from "./around-you";
import type { DecisionContext, RecalledMemory } from "./context";
import {
  describeBelongings,
  describeConversation,
  describeCurrentAction,
  describeGoals,
  describeLastFailure,
  describeMemories,
  describeNearbyEntities,
  describeWorkingMemory,
} from "./sections";
import { describeStats, describeStatus, describeTraits } from "./words";

const DECISION_TEMPLATE = "decision";
const CONTINUE_ACTION_TEMPLATE = "decision-continue";
const BASE_ACTIONS: readonly DecisionAction[] = [
  "walk_to",
  "interact",
  "give",
  "say",
  "recall",
  "wait",
];

type RecalledMemories = Partial<Record<Bucket, RecalledMemory[]>>;

export function listOfferedActions(isMidActionInterrupt: boolean): DecisionAction[] {
  return isMidActionInterrupt ? [...BASE_ACTIONS, "continue"] : [...BASE_ACTIONS];
}

export function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / config.decision.charsPerToken);
}

function buildTemplateValues(
  context: DecisionContext,
  memories: RecalledMemories,
  continueAction: string,
): TemplateValues {
  const { personality } = context;
  return {
    name: context.name,
    profession: context.profession,
    traits: describeTraits(personality.traits),
    core: personality.core,
    selfImage: personality.selfImage,
    mood: context.mood,
    body: describeStats(context.body),
    status: describeStatus(context, context.conditionWords),
    goals: describeGoals(context.goals),
    dailyPlan: context.dailyPlan || "none yet",
    simTime: context.simTime,
    intention: context.intention || "nothing in particular",
    currentAction: describeCurrentAction(context.currentAction, context.isMidActionInterrupt),
    lastFailure: describeLastFailure(context.lastFailure),
    place: context.place,
    here: describeNearbyEntities(context.nearbyEntities),
    knownPlaces: context.knownPlaces.join(", "),
    aroundYou: describeAroundYou(context.aroundYou),
    belongings: describeBelongings(context.belongings, context.itemlessVerbs),
    workingMemory: describeWorkingMemory(context.workingMemory),
    conversation: describeConversation(context.conversation),
    memories: describeMemories(memories, context.foggedBy),
    actions: listOfferedActions(context.isMidActionInterrupt).join(", "),
    sayWaitMinutes: String(config.decision.sayWaitMinutes),
    continueAction: context.isMidActionInterrupt ? continueAction : "",
  };
}

/** Drops the oldest memory from the lowest-priority bucket that still has any; null if none left. */
function withoutOneMemory(memories: RecalledMemories): RecalledMemories | null {
  const bucket = config.decision.memoryTrimOrder.find(
    (candidate) => (memories[candidate]?.length ?? 0) > 0,
  );
  if (!bucket) return null;
  const bucketMemories = memories[bucket] ?? [];
  const oldestIndex = bucketMemories.reduce(
    (oldest, memory, index) =>
      memory.minutesAgo > (bucketMemories[oldest]?.minutesAgo ?? -Infinity) ? index : oldest,
    0,
  );
  return {
    ...memories,
    [bucket]: bucketMemories.filter((_memory, index) => index !== oldestIndex),
  };
}

/**
 * Renders `decision.txt` for one agent. When the prompt is over `config.decision.promptTokenTarget`,
 * recalled memories are trimmed first: lowest-priority buckets, oldest first.
 */
export function buildDecisionPrompt(context: DecisionContext, promptsDirectory?: string): string {
  const template = loadTemplate(DECISION_TEMPLATE, promptsDirectory);
  const continueAction = loadTemplate(CONTINUE_ACTION_TEMPLATE, promptsDirectory).trim();
  const fillDecisionTemplate = (memories: RecalledMemories): string =>
    fillTemplate(
      template,
      buildTemplateValues(context, memories, continueAction),
      DECISION_TEMPLATE,
    );
  let memories: RecalledMemories = context.recalledMemories;
  let prompt = fillDecisionTemplate(memories);
  while (estimatePromptTokens(prompt) > config.decision.promptTokenTarget) {
    const trimmedMemories = withoutOneMemory(memories);
    if (!trimmedMemories) break;
    memories = trimmedMemories;
    prompt = fillDecisionTemplate(memories);
  }
  return prompt;
}
