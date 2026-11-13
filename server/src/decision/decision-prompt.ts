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
  describeDecisionReason,
  describeLastFailure,
  describeMemories,
  describeNearbyEntities,
  describePeopleOnMind,
  describePlans,
  describeWorkingMemory,
} from "./sections";
import { describeStats, describeTraits, joinWithAnd, splitStatus } from "./words";

const DECISION_TEMPLATE = "decision";
const CONTINUE_ACTION_TEMPLATE = "decision-continue";
const PRESSING_NEEDS_TEMPLATE = "decision-pressing";
/** Marks the end of a part of the template that is stable enough for the provider to cache. */
const CACHE_BREAKPOINT_MARKER = "<<<cache>>>\n";
const BASE_ACTIONS: readonly DecisionAction[] = ["walk_to", "interact", "give", "recall", "wait"];

type RecalledMemories = Partial<Record<Bucket, RecalledMemory[]>>;

export function listOfferedActions(isMidActionInterrupt: boolean): DecisionAction[] {
  return isMidActionInterrupt ? [...BASE_ACTIONS, "continue"] : [...BASE_ACTIONS];
}

export function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / config.decision.charsPerToken);
}

/** Optional parts of the prompt, each its own template, filled only when it applies. */
interface OptionalTemplates {
  continueAction: string;
  pressingNeeds: string;
}

function buildTemplateValues(
  context: DecisionContext,
  memories: RecalledMemories,
  optional: OptionalTemplates,
): TemplateValues {
  const { personality } = context;
  const status = splitStatus(context, context.conditionWords);
  const pressingNeeds =
    status.pressingSentences.length === 0
      ? ""
      : fillTemplate(
          optional.pressingNeeds,
          { sentences: status.pressingSentences.join("\n") },
          PRESSING_NEEDS_TEMPLATE,
        );
  return {
    name: context.name,
    profession: context.profession,
    traits: describeTraits(personality.traits),
    core: personality.core,
    selfImage: personality.selfImage,
    mood: context.mood,
    body: describeStats(context.body),
    status: status.otherWords.length === 0 ? "" : `You are ${joinWithAnd(status.otherWords)}.`,
    pressingNeeds,
    goals: describeGoals(context.goals),
    plans: describePlans(context.plans),
    dailyPlan: context.dailyPlan || "none yet",
    simTime: context.simTime,
    intention: context.intention || "nothing in particular",
    currentAction: describeCurrentAction(context.currentAction, context.isMidActionInterrupt),
    decisionReason: describeDecisionReason(context.decisionReason),
    lastFailure: describeLastFailure(context.lastFailure),
    place: context.place,
    here: describeNearbyEntities(context.nearbyEntities),
    knownPlaces: context.knownPlaces.join(", "),
    aroundYou: describeAroundYou(context.aroundYou),
    peopleOnMind: describePeopleOnMind(context.peopleOnMind),
    belongings: describeBelongings(context.belongings, context.itemlessVerbs),
    workingMemory: describeWorkingMemory(context.workingMemory),
    conversation: describeConversation(context.conversation),
    memories: describeMemories(memories, context.foggedBy),
    actions: listOfferedActions(context.isMidActionInterrupt).join(", "),
    sayWaitMinutes: String(config.decision.sayWaitMinutes),
    continueAction: context.isMidActionInterrupt ? optional.continueAction : "",
  };
}

function countMemories(memories: RecalledMemories): number {
  return Object.values(memories).reduce((sum, bucketMemories) => sum + bucketMemories.length, 0);
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

export interface DecisionPrompt {
  text: string;
  /** Offsets into `text` ending the part shared by all agents and the part stable per agent. */
  cacheBreakpoints: number[];
}

/** Removes the markers from a filled template and returns where each one was. */
function extractCacheBreakpoints(filledTemplate: string): DecisionPrompt {
  const pieces = filledTemplate.split(CACHE_BREAKPOINT_MARKER);
  const cacheBreakpoints: number[] = [];
  let length = 0;
  for (const piece of pieces.slice(0, -1)) {
    length += piece.length;
    cacheBreakpoints.push(length);
  }
  return { text: pieces.join(""), cacheBreakpoints };
}

/**
 * Renders `decision.txt` for one agent. When the prompt is over `config.decision.promptTokenTarget`,
 * recalled memories are trimmed first: lowest-priority buckets, oldest first, down to the minimum.
 */
export function buildCacheableDecisionPrompt(
  context: DecisionContext,
  promptsDirectory?: string,
): DecisionPrompt {
  const template = loadTemplate(DECISION_TEMPLATE, promptsDirectory);
  const optional: OptionalTemplates = {
    continueAction: loadTemplate(CONTINUE_ACTION_TEMPLATE, promptsDirectory).trim(),
    pressingNeeds: loadTemplate(PRESSING_NEEDS_TEMPLATE, promptsDirectory).trim(),
  };
  const fillDecisionTemplate = (memories: RecalledMemories): string =>
    fillTemplate(template, buildTemplateValues(context, memories, optional), DECISION_TEMPLATE);
  let memories: RecalledMemories = context.recalledMemories;
  let prompt = fillDecisionTemplate(memories);
  while (
    estimatePromptTokens(prompt) > config.decision.promptTokenTarget &&
    countMemories(memories) > config.decision.minimumRecalledMemories
  ) {
    const trimmedMemories = withoutOneMemory(memories);
    if (!trimmedMemories) break;
    memories = trimmedMemories;
    prompt = fillDecisionTemplate(memories);
  }
  return extractCacheBreakpoints(prompt);
}

export function buildDecisionPrompt(context: DecisionContext, promptsDirectory?: string): string {
  return buildCacheableDecisionPrompt(context, promptsDirectory).text;
}
