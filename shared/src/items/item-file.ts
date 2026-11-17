import { z } from "zod";
import { glyphSchema } from "../glyph";
import {
  componentDeclarationSchema,
  componentPathSchema,
  componentValuesSchema,
  identifierSchema,
} from "./component-schema";
import { stepSchema } from "./step-schema";
import { numberValueSchema } from "./value-schema";
import { matcherSchema } from "./matcher-schema";

/*
 * The shape of `seeds/items.json`: the world settings, component declarations, item definitions,
 * verbs, rules and instincts. Cross-references (unknown names, what a step reads or works on) are checked by `findItemFileProblems`.
 */

/** Extras of the decision a verb uses, read as `choice.<name>`. */
export const VERB_TAKES = ["amount", "minutes", "text"] as const;
export type VerbTake = (typeof VERB_TAKES)[number];

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
  /** The entity the verb is done with or to: the `item`. Omitted for a bare-handed verb (`punch`). */
  appliesTo: matcherSchema.optional(),
  /** What it is aimed at: the `target`. Omitted for a verb with no target. */
  target: matcherSchema.optional(),
  /** Tiles from the user to the item and to the target. */
  reach: numberValueSchema.default(1),
  takes: z.array(z.enum(VERB_TAKES)).default([]),
  /** A walker blocked by an entity this verb applies to does it on the way through. */
  isDoneInPassing: z.boolean().default(false),
  steps: z.array(stepSchema),
  phrases: phrasesSchema.default({}),
});
export type Verb = z.infer<typeof verbSchema>;

const ruleParts = {
  /** Which things the rule fires on. */
  if: matcherSchema,
  steps: z.array(stepSchema),
  /** How a death from this rule's damage reads ("burned to death"). */
  killed: z.string().trim().min(1).optional(),
};

/**
 * Steps on a trigger other than an agent's choice: every few sim-minutes on each matching thing,
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
const instinctParts = {
  /** Which entities have this instinct, matched against the creature itself (`where` is `self`). */
  appliesTo: matcherSchema,
};

/**
 * How a creature acts, with no LLM. Each tick a creature follows the first instinct, in file
 * order, that applies to it and finds something to act on: `verb` walks to the nearest thing it
 * sees that fits and does the verb to it, `flee` steps away from what it fears, `wander` ambles.
 * Its numbers are values, so each creature's own come from its components (`self.timid.radius`).
 */
export const instinctSchema = z.discriminatedUnion("do", [
  z.strictObject({
    do: z.literal("verb"),
    ...instinctParts,
    /** The verb's name; the verb whose `appliesTo` fits the creature itself is the one done. */
    verb: z.string().trim().min(1),
    /** Narrows the verb's own `target` to what this instinct goes for. */
    target: matcherSchema.optional(),
    /** How many tiles away the creature notices something to go for. */
    range: numberValueSchema,
    /** Only goes for whoever is behind this component on the creature (who `provoked` it). */
    sourceOf: identifierSchema.optional(),
  }),
  z.strictObject({
    do: z.literal("flee"),
    ...instinctParts,
    /** What it runs from. */
    from: matcherSchema,
    /** Tiles within which what it fears makes it run. */
    radius: numberValueSchema,
  }),
  z.strictObject({
    do: z.literal("wander"),
    ...instinctParts,
    /** Chance each tick that it takes a step in a random direction. */
    chance: numberValueSchema,
  }),
]);
export type Instinct = z.infer<typeof instinctSchema>;
export type InstinctOfKind<Kind extends Instinct["do"]> = Extract<Instinct, { do: Kind }>;

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
  /** A creature matching this catches the eye as it comes into view: it gives a decision. */
  noticeOnSight: matcherSchema.optional(),
  /** Things the places an agent knows leave out of what they list (doors, windows, benches). */
  placeListingOmits: matcherSchema.optional(),
  /** Verbs, by name, that turn the head of whoever sees or hears someone do them. */
  noticedVerbs: z.array(z.string().trim().min(1)).optional(),
  /** The definition of every agent's body. */
  agentBody: identifierSchema,
  /** The number field that is an agent's health. */
  agentHealth: componentPathSchema,
  /** The number fields that are a creature's strength and agility; one without them is middling. */
  creatureStrength: componentPathSchema.optional(),
  creatureAgility: componentPathSchema.optional(),
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
  "noticeOnSight",
  "placeListingOmits",
] as const satisfies readonly (keyof WorldSettings)[];

export const itemFileSchema = z.strictObject({
  world: worldSettingsSchema,
  components: z.record(identifierSchema, componentDeclarationSchema),
  definitions: z.array(itemDefinitionSchema),
  verbs: z.array(verbSchema),
  rules: z.array(ruleSchema).default([]),
  instincts: z.array(instinctSchema).default([]),
});

export type ItemFile = z.infer<typeof itemFileSchema>;

export function parseItemFile(json: unknown): ItemFile {
  return itemFileSchema.parse(json);
}
