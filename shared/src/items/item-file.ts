import { z } from "zod";
import { glyphSchema } from "../glyph";
import {
  componentDeclarationSchema,
  componentPathSchema,
  componentValuesSchema,
  identifierSchema,
} from "./component-schema";
import { effectSchema, numberValueSchema } from "./effect-schema";
import { matcherSchema } from "./matcher-schema";

/*
 * The shape of `seeds/items.json`: the world settings, component declarations, item definitions,
 * verbs and rules. Cross-references (unknown names, what a verb's or rule's numbers depend on,
 * overlapping verbs) are checked by `findItemFileProblems`.
 */

export const VERB_TARGETS = ["none", "agent", "entity", "agent_or_entity"] as const;
export type VerbTarget = (typeof VERB_TARGETS)[number];

const phrasesSchema = z.strictObject({
  ongoing: z.string().optional(),
  done: z.string().optional(),
  attempt: z.string().optional(),
  hit: z.string().optional(),
  missed: z.string().optional(),
  killed: z.string().optional(),
});
export type VerbPhrases = z.infer<typeof phrasesSchema>;

export const verbSchema = z.strictObject({
  name: z.string().trim().min(1),
  /** The thing the verb is done with or to. Omitted for a bare-handed verb (`punch`). */
  appliesTo: matcherSchema.optional(),
  target: z.enum(VERB_TARGETS).default("none"),
  canTargetSelf: z.boolean().default(false),
  reach: numberValueSchema.default(1),
  /** Null: it ends by its own rules (sleep). */
  minutes: numberValueSchema.nullable().default(1),
  /** Sound reach in tiles while it runs; null if silent. */
  loudness: numberValueSchema.nullable().default(null),
  takesText: z.boolean().default(false),
  /** A walker blocked by an entity this verb applies to does it on the way through (a door). */
  isDoneInPassing: z.boolean().default(false),
  /** Items used up from the user's inventory when it starts, by definition id. */
  inputs: z.record(identifierSchema, z.number().int().positive()).default({}),
  /** Held items needed but not used up: every listed definition, and something with each component. */
  tools: z
    .strictObject({
      definitions: z.array(identifierSchema).default([]),
      components: z.array(identifierSchema).default([]),
    })
    .optional(),
  hitRoll: z.strictObject({ baseHitChance: numberValueSchema }).optional(),
  effects: z.array(effectSchema),
  phrases: phrasesSchema.default({}),
});
export type Verb = z.infer<typeof verbSchema>;

const ruleParts = {
  /** Which things the rule fires on. */
  if: matcherSchema,
  effects: z.array(effectSchema),
  /** How a death from this rule's damage reads ("burned to death"). */
  killed: z.string().trim().min(1).optional(),
};

/**
 * Effects on a trigger other than an agent's choice: every few sim-minutes on each matching thing,
 * when a stimulus reaches a matching thing, or the moment a thing starts matching.
 */
export const ruleSchema = z.discriminatedUnion("trigger", [
  z.strictObject({
    trigger: z.literal("every"),
    minutes: z.number().int().positive(),
    ...ruleParts,
  }),
  z.strictObject({ trigger: z.literal("stimulus"), stimulus: z.string().min(1), ...ruleParts }),
  z.strictObject({ trigger: z.literal("becomes"), ...ruleParts }),
]);
export type Rule = z.infer<typeof ruleSchema>;
export type RuleTrigger = Rule["trigger"];
export type RuleOfTrigger<Trigger extends RuleTrigger> = Extract<Rule, { trigger: Trigger }>;

export const itemDefinitionSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  /** Omitted for things counted without a plural ("3 bread"). */
  plural: z.string().trim().min(1).optional(),
  glyph: glyphSchema,
  /** Component name to its field values. */
  components: z.record(identifierSchema, componentValuesSchema).default({}),
});
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

/** Matchers and names the engine's physics reads. An omitted matcher matches nothing. */
export const worldSettingsSchema = z.strictObject({
  /** A tile with a matching entity on it blocks sight. */
  sightBlockedBy: matcherSchema.optional(),
  /** A tile with a matching entity on it can't be walked through. */
  movementBlockedBy: matcherSchema.optional(),
  /** Sound passing a tile with a matching entity is muffled. */
  soundMuffledBy: matcherSchema.optional(),
  /** Nobody but its own agent sees what is inside a matching thing. */
  contentsHiddenBy: matcherSchema.optional(),
  /** Others see a matching entity directly inside an agent ("Tobias, carrying a knife"). */
  shownWhenCarried: matcherSchema.optional(),
  /** A matching entity on a tile reads as lying on the floor or the ground. */
  lyingWhenOnTile: matcherSchema.optional(),
  /** Validation warns when a verb or rule could make or destroy a matching thing. */
  closedSupply: matcherSchema.optional(),
  /** The definition of every agent's body. */
  agentBody: identifierSchema,
  /** The number field that is an agent's health. */
  agentHealth: componentPathSchema,
});
export type WorldSettings = z.infer<typeof worldSettingsSchema>;

export const WORLD_MATCHER_SETTINGS = [
  "sightBlockedBy",
  "movementBlockedBy",
  "soundMuffledBy",
  "contentsHiddenBy",
  "shownWhenCarried",
  "lyingWhenOnTile",
  "closedSupply",
] as const satisfies readonly (keyof WorldSettings)[];

export const itemFileSchema = z.strictObject({
  world: worldSettingsSchema,
  components: z.record(identifierSchema, componentDeclarationSchema),
  definitions: z.array(itemDefinitionSchema),
  verbs: z.array(verbSchema),
  rules: z.array(ruleSchema).default([]),
});

export type ItemFile = z.infer<typeof itemFileSchema>;

export function parseItemFile(json: unknown): ItemFile {
  return itemFileSchema.parse(json);
}
