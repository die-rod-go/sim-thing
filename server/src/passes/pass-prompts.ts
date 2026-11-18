import { TRAIT_NAMES, type Agent, type ItemCatalog, type TraitName } from "@village/shared";
import { z } from "zod";
import { describeAgenda } from "../agenda/agenda";
import { config } from "../config";
import type { HeldKnowledge } from "../decision/context";
import type { ReplySchemas } from "../decision/reply-schema";
import { nullableJsonString, strictJsonObject, writtenText } from "../decision/schema-fields";
import {
  describeEpisodes,
  describeKeyMemories,
  describeLongTermGoals,
  describeOlderMemory,
  describePeople,
  describePersonaLine,
  describeSeenPlaces,
  describeStream,
} from "../decision/sections";
import { describeTraitWord } from "../decision/words";
import { renderTemplate } from "../llm/templates";
import { describeWorldKnowledge } from "./world-knowledge";

const CONTEXT_TEMPLATE = "pass-context";
const REALITY_TEMPLATE = "reality-pass";

/** What a pass may know of the world itself: its rules and place names, never where things are. */
export interface PassWorld {
  items: ItemCatalog;
  placeNames: readonly string[];
}

function describeTraitValues(traits: Record<TraitName, number>): string {
  return TRAIT_NAMES.map((traitName) =>
    config.traits.valueText
      .split("{trait}")
      .join(traitName)
      .split("{value}")
      .join(String(traits[traitName]))
      .split("{words}")
      .join(describeTraitWord(traitName, traits[traitName])),
  )
    .map((line) => `- ${line}`)
    .join("\n");
}

/**
 * What the day plan, the reflection and the reality pass read of the agent: everything it
 * remembers and holds. Not cached: each call sends its own reply schema and the stream moves on
 * between them.
 */
export function buildPassContext(
  agent: Agent,
  held: HeldKnowledge,
  promptsDirectory?: string,
): string {
  return renderTemplate(
    CONTEXT_TEMPLATE,
    {
      olderMemory: describeOlderMemory(held.history, held.daySummary, held.chronicles),
      episodes: describeEpisodes(held.episodes),
      stream: describeStream(held.stream),
      seenPlaces: describeSeenPlaces(held.seenPlaces),
      profession: agent.profession,
      core: agent.personality.core,
      selfImage: agent.personality.selfImage,
      voice: describePersonaLine(config.memory.voiceLabel, agent.personality.voice),
      routine: describePersonaLine(config.memory.routineLabel, agent.personality.routine),
      traits: describeTraitValues(agent.personality.traits),
      longTermGoals: describeLongTermGoals(held.longTermGoals),
      today: describeAgenda(held.agenda),
      keyMemories: describeKeyMemories(held.keyMemories),
      people: describePeople(held.people),
    },
    promptsDirectory,
  );
}

/** The reality pass's prompt: the world's rules, its places, then everything the agent holds. */
export function buildRealityPrompt(
  agent: Agent,
  held: HeldKnowledge,
  world: PassWorld,
  promptsDirectory?: string,
): string {
  return renderTemplate(
    REALITY_TEMPLATE,
    {
      name: agent.name,
      context: buildPassContext(agent, held, promptsDirectory),
      places: world.placeNames.join(config.realityPass.placeJoiner),
      worldKnowledge: describeWorldKnowledge(world.items, promptsDirectory),
      maxChars: String(config.realityPass.thoughtMaxChars),
    },
    promptsDirectory,
  );
}

const longTermText = writtenText(config.goals.longTermFieldMaxChars);
/** The full list of long-term goals, as the day plan and the reflection rewrite it. */
export const longTermGoalListSchema = z
  .array(z.object({ goal: longTermText.min(1), reason: longTermText, progress: longTermText }))
  .max(config.goals.maxLongTerm);

const TEXT = { type: "string" };

/** The JSON schema of `longTermGoalListSchema`. */
export const LONG_TERM_GOAL_LIST_JSON = {
  type: "array",
  items: strictJsonObject({ goal: TEXT, reason: TEXT, progress: TEXT }),
};

const realityReplySchema = z.object({
  noticed: writtenText(config.realityPass.noticedMaxChars),
  thought: writtenText(config.realityPass.thoughtMaxChars).nullable(),
});

export type RealityReply = z.infer<typeof realityReplySchema>;

export function buildRealityReplySchema(): ReplySchemas<RealityReply> {
  return {
    schema: realityReplySchema,
    jsonSchema: strictJsonObject({ noticed: TEXT, thought: nullableJsonString() }),
    schemaName: "reality_reply",
  };
}
