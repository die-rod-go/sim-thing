import { TRAIT_NAMES, type Agent, type LlmCallKind, type TraitName } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { HeldKnowledge } from "../decision/context";
import type { ReplySchemas } from "../decision/reply-schema";
import {
  dropEmptyFields,
  looseEnum,
  nullableJsonString,
  strictJsonObject,
  writtenText,
} from "../decision/schema-fields";
import {
  describeEpisodes,
  describeLongTermGoals,
  describeOlderMemory,
  describePeople,
  describeSeenPlaces,
  describeShortTermGoals,
  describeStream,
} from "../decision/sections";
import { describeTraitWord } from "../decision/words";
import { renderTemplate } from "../llm/templates";
import type { PassName } from "../memory/summaries";

const CONTEXT_TEMPLATE = "pass-context";

interface PassSettings {
  callKind: LlmCallKind;
  templateName: string;
}

const PASS_SETTINGS: Record<PassName, PassSettings> = {
  people: { callKind: "people", templateName: "people-pass" },
  shortTermGoals: { callKind: "short_term_goals", templateName: "short-term-goals-pass" },
  identity: { callKind: "identity", templateName: "identity-pass" },
  longTermGoals: { callKind: "long_term_goals", templateName: "long-term-goals-pass" },
};

export function findPassCallKind(pass: PassName): LlmCallKind {
  return PASS_SETTINGS[pass].callKind;
}

export function findPassSchemaName(pass: PassName): string {
  return `${PASS_SETTINGS[pass].callKind}_reply`;
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
 * What every pass reads, the same text for each. Passes are not cached: each sends its own reply
 * schema and the stream moves on between them, so no pass could read another's cached prompt.
 */
function buildPassContext(agent: Agent, held: HeldKnowledge, promptsDirectory?: string): string {
  return renderTemplate(
    CONTEXT_TEMPLATE,
    {
      name: agent.name,
      olderMemory: describeOlderMemory(held.history, held.daySummary, held.chronicles),
      episodes: describeEpisodes(held.episodes),
      stream: describeStream(held.stream),
      seenPlaces: describeSeenPlaces(held.seenPlaces),
      profession: agent.profession,
      core: agent.personality.core,
      selfImage: agent.personality.selfImage,
      traits: describeTraitValues(agent.personality.traits),
      longTermGoals: describeLongTermGoals(held.longTermGoals),
      shortTermGoals: describeShortTermGoals(held.shortTermGoals),
      people: describePeople(held.people),
    },
    promptsDirectory,
  );
}

function listQuestionValues(pass: PassName, held: HeldKnowledge): Record<string, string> {
  switch (pass) {
    case "people":
      return {
        personNames: held.people.map((person) => person.name).join(", "),
        maxChars: String(config.people.fieldMaxChars),
      };
    case "shortTermGoals":
      return {
        maxGoals: String(config.goals.maxShortTerm),
        maxSteps: String(config.goals.maxSteps),
        maxChars: String(config.goals.shortTermFieldMaxChars),
      };
    case "longTermGoals":
      return {
        maxGoals: String(config.goals.maxLongTerm),
        maxChars: String(config.goals.longTermFieldMaxChars),
      };
    case "identity":
      return {
        maxDelta: String(config.traits.passDeltaClamp),
        traitNames: TRAIT_NAMES.join(", "),
      };
  }
}

/** One pass's prompt: the shared context, then that pass's question. */
export function buildPassPrompt(
  pass: PassName,
  agent: Agent,
  held: HeldKnowledge,
  promptsDirectory?: string,
): string {
  return renderTemplate(
    PASS_SETTINGS[pass].templateName,
    {
      context: buildPassContext(agent, held, promptsDirectory),
      ...listQuestionValues(pass, held),
    },
    promptsDirectory,
  );
}

const TRAIT_ENUM = TRAIT_NAMES as readonly [TraitName, ...TraitName[]];

function nullableText(maxChars: number) {
  return writtenText(maxChars).optional();
}

const peopleReplySchema = z.object({
  people: z.array(
    z.preprocess(
      dropEmptyFields,
      z.object({
        person: z.string().trim().min(1),
        whatIThinkOfThem: nullableText(config.people.fieldMaxChars),
        whatTheyThinkOfMe: nullableText(config.people.fieldMaxChars),
        whatIWantFromThem: nullableText(config.people.fieldMaxChars),
        whatTheyWantFromMe: nullableText(config.people.fieldMaxChars),
        misc: nullableText(config.people.fieldMaxChars),
      }),
    ),
  ),
});

const shortTermText = writtenText(config.goals.shortTermFieldMaxChars);
const shortTermGoalsReplySchema = z.object({
  goals: z
    .array(
      z.object({
        goal: shortTermText.min(1),
        reason: shortTermText,
        steps: z.array(shortTermText.min(1)).max(config.goals.maxSteps),
        progress: shortTermText,
      }),
    )
    .max(config.goals.maxShortTerm),
});

const longTermText = writtenText(config.goals.longTermFieldMaxChars);
const longTermGoalsReplySchema = z.object({
  goals: z
    .array(z.object({ goal: longTermText.min(1), reason: longTermText, progress: longTermText }))
    .max(config.goals.maxLongTerm),
});

const identityReplySchema = z.preprocess(
  dropEmptyFields,
  z.object({
    traitChanges: z
      .array(
        z.object({
          trait: looseEnum(TRAIT_ENUM),
          delta: z.number(),
          reason: z.string().trim(),
        }),
      )
      .default([]),
    profession: z.string().trim().optional(),
    core: z.string().trim().optional(),
    selfImage: z.string().trim().optional(),
  }),
);

export type PeopleReply = z.infer<typeof peopleReplySchema>;
export type ShortTermGoalsReply = z.infer<typeof shortTermGoalsReplySchema>;
export type LongTermGoalsReply = z.infer<typeof longTermGoalsReplySchema>;
export interface IdentityReply {
  traitChanges: { trait: TraitName; delta: number; reason: string }[];
  profession?: string | undefined;
  core?: string | undefined;
  selfImage?: string | undefined;
}

export interface PassReplies {
  people: PeopleReply;
  shortTermGoals: ShortTermGoalsReply;
  longTermGoals: LongTermGoalsReply;
  identity: IdentityReply;
}

const TEXT = { type: "string" };

function jsonList(items: Record<string, unknown>): Record<string, unknown> {
  return { type: "array", items };
}

const JSON_SCHEMAS: Record<PassName, Record<string, unknown>> = {
  people: strictJsonObject({
    people: jsonList(
      strictJsonObject({
        person: TEXT,
        whatIThinkOfThem: nullableJsonString(),
        whatTheyThinkOfMe: nullableJsonString(),
        whatIWantFromThem: nullableJsonString(),
        whatTheyWantFromMe: nullableJsonString(),
        misc: nullableJsonString(),
      }),
    ),
  }),
  shortTermGoals: strictJsonObject({
    goals: jsonList(
      strictJsonObject({ goal: TEXT, reason: TEXT, steps: jsonList(TEXT), progress: TEXT }),
    ),
  }),
  longTermGoals: strictJsonObject({
    goals: jsonList(strictJsonObject({ goal: TEXT, reason: TEXT, progress: TEXT })),
  }),
  identity: strictJsonObject({
    traitChanges: jsonList(
      strictJsonObject({
        trait: { type: "string", enum: [...TRAIT_NAMES] },
        delta: { type: "number" },
        reason: TEXT,
      }),
    ),
    profession: nullableJsonString(),
    core: nullableJsonString(),
    selfImage: nullableJsonString(),
  }),
};

const ZOD_SCHEMAS: { [Pass in PassName]: z.ZodType<PassReplies[Pass]> } = {
  people: peopleReplySchema,
  shortTermGoals: shortTermGoalsReplySchema,
  longTermGoals: longTermGoalsReplySchema,
  identity: identityReplySchema,
};

export function buildPassReplySchema<Pass extends PassName>(
  pass: Pass,
): ReplySchemas<PassReplies[Pass]> {
  return {
    schema: ZOD_SCHEMAS[pass],
    jsonSchema: JSON_SCHEMAS[pass],
    schemaName: findPassSchemaName(pass),
  };
}
