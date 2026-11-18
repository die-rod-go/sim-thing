import type { DecisionAction } from "@village/shared";
import { config } from "../config";
import { describeAgenda } from "../agenda/agenda";
import { fillTemplate, loadTemplate } from "../llm/templates";
import { describePlace } from "../memory/filing";
import type { TemplateValues } from "../llm/templates";
import { describeAroundYou, describeNotSeenLately } from "./around-you";
import type { DecisionContext } from "./context";
import {
  describeBelongings,
  describeCurrentAction,
  describeDecisionReason,
  describeLastFailure,
  describeEpisodes,
  describeKeyMemories,
  describeNearbyEntities,
  describeOlderMemory,
  describeLongTermGoals,
  describeNameWithPronouns,
  describePeopleOnMind,
  describePersonLines,
  describeSeenPlaces,
  describeStream,
} from "./sections";
import { describeStats, describeTraits, joinWithAnd, splitStatus } from "./words";

const DECISION_TEMPLATE = "decision";
const CONTINUE_ACTION_TEMPLATE = "decision-continue";
const PRESSING_NEEDS_TEMPLATE = "decision-pressing";
const OFFER_TEMPLATE = "decision-offer";
const OWN_OFFER_TEMPLATE = "decision-own-offer";
const RECKONING_TEMPLATE = "decision-reckoning";
/** Marks the end of a part of the template that is stable enough for the provider to cache. */
const CACHE_BREAKPOINT_MARKER = "<<<cache>>>\n";
const BASE_ACTIONS: readonly DecisionAction[] = ["walk_to", "interact", "give", "wait", "follow"];

export function listOfferedActions(isMidActionInterrupt: boolean): DecisionAction[] {
  return isMidActionInterrupt ? [...BASE_ACTIONS, "continue"] : [...BASE_ACTIONS];
}

/** Optional parts of the prompt, each its own template, filled only when it applies. */
interface OptionalTemplates {
  continueAction: string;
  pressingNeeds: string;
  offer: string;
  ownOffer: string;
  reckoning: string;
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
    worldKnowledge: context.worldKnowledge,
    identity: `You are ${describeNameWithPronouns(context.name, context.pronouns)}.`,
    profession: context.profession,
    traits: describeTraits(personality.traits),
    core: personality.core,
    selfImage: personality.selfImage,
    mood: context.mood,
    body: describeStats(context.body),
    status: status.otherWords.length === 0 ? "" : `You are ${joinWithAnd(status.otherWords)}.`,
    pressingNeeds,
    longTermGoals: describeLongTermGoals(context.longTermGoals),
    today: describeAgenda(context.agenda),
    maxAgendaAdded: String(config.agenda.maxAddedPerDecision),
    maxActs: String(config.decision.maxActs),
    followMinutes: String(config.walking.followDefaultMinutes),
    people: describePersonLines(context.people),
    peopleOnMind: describePeopleOnMind(context.peopleOnMind),
    keyMemories: describeKeyMemories(context.keyMemories),
    reckoning: context.isReckoning
      ? fillTemplate(
          optional.reckoning,
          {
            name: context.name,
            reason: context.decisionReason ?? "",
            maxItems: String(config.agenda.maxItems),
          },
          RECKONING_TEMPLATE,
        )
      : "",
    simTime: context.simTime,
    intention: context.intention || "nothing in particular",
    currentAction: describeCurrentAction(context.currentAction, context.isMidActionInterrupt),
    decisionReason: describeDecisionReason(context.decisionReason),
    lastFailure: describeLastFailure(context.lastFailure),
    offer:
      context.offer === null
        ? ""
        : fillTemplate(
            optional.offer,
            { giver: context.offer.giverName, what: context.offer.itemText },
            OFFER_TEMPLATE,
          ),
    ownOffer:
      context.ownOffer === null
        ? ""
        : fillTemplate(
            optional.ownOffer,
            { recipient: context.ownOffer.recipientName, what: context.ownOffer.itemText },
            OWN_OFFER_TEMPLATE,
          ),
    place: describePlace(context.place),
    here: describeNearbyEntities(context.nearbyEntities),
    seenPlaces: describeSeenPlaces(context.seenPlaces),
    aroundYou: describeAroundYou(context.aroundYou),
    notSeenLately: describeNotSeenLately(context.aroundYou),
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
  /**
   * Offsets into `text` ending each cached part: the part shared by all agents, who the agent is,
   * its older memory and its episodes. A part with nothing in it has no breakpoint.
   */
  cacheBreakpoints: number[];
}

/**
 * Removes the markers from a filled template and returns where each one was. A part holding only
 * blank lines (no memory yet) is dropped with its marker, so no cached block is empty.
 */
export function extractCacheBreakpoints(filledTemplate: string): DecisionPrompt {
  const pieces = filledTemplate.split(CACHE_BREAKPOINT_MARKER);
  const cacheBreakpoints: number[] = [];
  let text = "";
  for (const piece of pieces.slice(0, -1)) {
    if (piece.trim() === "") continue;
    text += piece;
    cacheBreakpoints.push(text.length);
  }
  return { text: text + (pieces[pieces.length - 1] ?? ""), cacheBreakpoints };
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
    offer: loadTemplate(OFFER_TEMPLATE, promptsDirectory).trim(),
    ownOffer: loadTemplate(OWN_OFFER_TEMPLATE, promptsDirectory).trim(),
    reckoning: loadTemplate(RECKONING_TEMPLATE, promptsDirectory).trim(),
  };
  const filled = fillTemplate(template, buildTemplateValues(context, optional), DECISION_TEMPLATE);
  return extractCacheBreakpoints(filled);
}

export function buildDecisionPrompt(context: DecisionContext, promptsDirectory?: string): string {
  return buildCacheableDecisionPrompt(context, promptsDirectory).text;
}
