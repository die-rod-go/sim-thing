import {
  TRAIT_NAMES,
  type Agent,
  type ItemCatalog,
  type KeyMemory,
  type TraitName,
} from "@village/shared";
import { z } from "zod";
import { PLANNED_ITEM_JSON, plannedItemSchema } from "../agenda/agenda-schema";
import { config } from "../config";
import type { HeldKnowledge } from "../decision/context";
import type { ReplySchemas } from "../decision/reply-schema";
import {
  dropEmptyFields,
  looseEnum,
  nullableJsonObject,
  nullableJsonString,
  strictJsonObject,
  writtenText,
} from "../decision/schema-fields";
import { describeKeyMemory } from "../decision/sections";
import { renderTemplate } from "../llm/templates";
import { LONG_TERM_GOAL_LIST_JSON, buildPassContext, longTermGoalListSchema } from "./pass-prompts";
import { describeWorldKnowledge } from "./world-knowledge";

const REFLECTION_TEMPLATE = "reflection";

export interface ReflectionInput {
  agent: Agent;
  held: HeldKnowledge;
  items: ItemCatalog;
  /** Moments marked to remember, waiting for this reflection. */
  candidates: readonly KeyMemory[];
  /** Where the agent is and who is around, already described. */
  situation: string;
}

function describeCandidates(candidates: readonly KeyMemory[]): string {
  if (candidates.length === 0) return "";
  const lines = candidates.map((candidate) => `- ${describeKeyMemory(candidate)}`);
  return `## ${config.memory.keyMemoryCandidatesTitle}\n${lines.join("\n")}`;
}

/** The reflection's prompt: the world, everything the agent holds, where it is, the question. */
export function buildReflectionPrompt(input: ReflectionInput, promptsDirectory?: string): string {
  return renderTemplate(
    REFLECTION_TEMPLATE,
    {
      name: input.agent.name,
      worldKnowledge: describeWorldKnowledge(input.items, promptsDirectory),
      context: buildPassContext(input.agent, input.held, promptsDirectory),
      candidates: describeCandidates(input.candidates),
      situation: input.situation,
      personNames: input.held.people.map((person) => person.name).join(", "),
      personMaxChars: String(config.people.fieldMaxChars),
      maxGoals: String(config.goals.maxLongTerm),
      goalMaxChars: String(config.goals.longTermFieldMaxChars),
      maxDelta: String(config.traits.passDeltaClamp),
      traitNames: TRAIT_NAMES.join(", "),
      maxKeyMemories: String(config.memory.keyMemoriesMax),
      keyMemoryMaxChars: String(config.memory.keyMemoryMaxChars),
    },
    promptsDirectory,
  );
}

const TRAIT_ENUM = TRAIT_NAMES as readonly [TraitName, ...TraitName[]];

function personText() {
  return writtenText(config.people.fieldMaxChars).optional();
}

const personChangeSchema = z.preprocess(
  dropEmptyFields,
  z.object({
    person: z.string().trim().min(1),
    whatIThinkOfThem: personText(),
    whatTheyThinkOfMe: personText(),
    whatIWantFromThem: personText(),
    whatTheyWantFromMe: personText(),
    misc: personText(),
  }),
);

const traitChangeSchema = z.object({
  trait: looseEnum(TRAIT_ENUM),
  delta: z.number(),
  reason: z.string().trim(),
});

const keyMemorySchema = z.object({
  day: z.number().int().positive(),
  text: writtenText(config.memory.keyMemoryMaxChars).min(1),
});

const proseSchema = z.string().trim().min(1).nullable().default(null);

const reflectionReplySchema = z.preprocess(
  dropEmptyFields,
  z.object({
    people: z.array(personChangeSchema).default([]),
    longTermGoals: longTermGoalListSchema.nullable().default(null),
    traitChanges: z.array(traitChangeSchema).default([]),
    profession: proseSchema,
    core: proseSchema,
    selfImage: proseSchema,
    voice: proseSchema,
    keyMemories: z
      .array(keyMemorySchema)
      .transform((memories) => memories.slice(-config.memory.keyMemoriesMax))
      .nullable()
      .default(null),
    agenda: z
      .array(plannedItemSchema)
      .transform((items) => items.slice(0, config.agenda.maxItems))
      .nullable()
      .default(null),
  }),
);

export type ReflectionReply = z.infer<typeof reflectionReplySchema>;
export type PersonChange = ReflectionReply["people"][number];
export type TraitChange = ReflectionReply["traitChanges"][number];

const TEXT = { type: "string" };

export function buildReflectionReplySchema(): ReplySchemas<ReflectionReply> {
  return {
    schema: reflectionReplySchema,
    jsonSchema: strictJsonObject({
      people: {
        type: "array",
        items: strictJsonObject({
          person: TEXT,
          whatIThinkOfThem: nullableJsonString(),
          whatTheyThinkOfMe: nullableJsonString(),
          whatIWantFromThem: nullableJsonString(),
          whatTheyWantFromMe: nullableJsonString(),
          misc: nullableJsonString(),
        }),
      },
      longTermGoals: nullableJsonObject(LONG_TERM_GOAL_LIST_JSON),
      traitChanges: {
        type: "array",
        items: strictJsonObject({
          trait: { type: "string", enum: [...TRAIT_NAMES] },
          delta: { type: "number" },
          reason: TEXT,
        }),
      },
      profession: nullableJsonString(),
      core: nullableJsonString(),
      selfImage: nullableJsonString(),
      voice: nullableJsonString(),
      keyMemories: nullableJsonObject({
        type: "array",
        items: strictJsonObject({ day: { type: "integer" }, text: TEXT }),
      }),
      agenda: nullableJsonObject({ type: "array", items: PLANNED_ITEM_JSON }),
    }),
    schemaName: "reflection_reply",
  };
}
