import type { DecisionAction } from "@village/shared";
import { config } from "../config";
import { fillTemplate, loadTemplate } from "../llm/templates";
import type { TemplateValues } from "../llm/templates";
import { describeAroundYou } from "./around-you";
import type { DecisionContext } from "./context";
import {
  describeBelongings,
  describeCurrentAction,
  describeGoals,
  describeDecisionReason,
  describeLastFailure,
  describeEpisodes,
  describeNearbyEntities,
  describeOlderMemory,
  describePeopleOnMind,
  describeSeenPlaces,
  describeStream,
} from "./sections";
import { describeStats, describeTraits, joinWithAnd, splitStatus } from "./words";

const DECISION_TEMPLATE = "decision";
const CONTINUE_ACTION_TEMPLATE = "decision-continue";
const PRESSING_NEEDS_TEMPLATE = "decision-pressing";
/** Marks the end of a part of the template that is stable enough for the provider to cache. */
const CACHE_BREAKPOINT_MARKER = "<<<cache>>>\n";
const BASE_ACTIONS: readonly DecisionAction[] = ["walk_to", "interact", "give", "wait"];

export function listOfferedActions(isMidActionInterrupt: boolean): DecisionAction[] {
  return isMidActionInterrupt ? [...BASE_ACTIONS, "continue"] : [...BASE_ACTIONS];
}

/** Optional parts of the prompt, each its own template, filled only when it applies. */
interface OptionalTemplates {
  continueAction: string;
  pressingNeeds: string;
}

function buildTemplateValues(
  context: DecisionContext,
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
    simTime: context.simTime,
    intention: context.intention || "nothing in particular",
    currentAction: describeCurrentAction(context.currentAction, context.isMidActionInterrupt),
    decisionReason: describeDecisionReason(context.decisionReason),
    lastFailure: describeLastFailure(context.lastFailure),
    place: context.place,
    here: describeNearbyEntities(context.nearbyEntities),
    seenPlaces: describeSeenPlaces(context.seenPlaces),
    aroundYou: describeAroundYou(context.aroundYou),
    peopleOnMind: describePeopleOnMind(context.peopleOnMind),
    belongings: describeBelongings(context.belongings, context.itemlessVerbs),
    olderMemory: describeOlderMemory(context.history, context.daySummary, context.chronicles),
    episodes: describeEpisodes(context.episodes),
    stream: describeStream(context.stream),
    actions: listOfferedActions(context.isMidActionInterrupt).join(", "),
    sayWaitMinutes: String(config.decision.sayWaitMinutes),
    continueAction: context.isMidActionInterrupt ? optional.continueAction : "",
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

/** Renders `decision.txt` for one agent. */
export function buildCacheableDecisionPrompt(
  context: DecisionContext,
  promptsDirectory?: string,
): DecisionPrompt {
  const template = loadTemplate(DECISION_TEMPLATE, promptsDirectory);
  const optional: OptionalTemplates = {
    continueAction: loadTemplate(CONTINUE_ACTION_TEMPLATE, promptsDirectory).trim(),
    pressingNeeds: loadTemplate(PRESSING_NEEDS_TEMPLATE, promptsDirectory).trim(),
  };
  const filled = fillTemplate(template, buildTemplateValues(context, optional), DECISION_TEMPLATE);
  return extractCacheBreakpoints(filled);
}

export function buildDecisionPrompt(context: DecisionContext, promptsDirectory?: string): string {
  return buildCacheableDecisionPrompt(context, promptsDirectory).text;
}
