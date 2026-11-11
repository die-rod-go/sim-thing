import { parseComponentPath } from "./component-schema";
import type { Effect } from "./effect-schema";
import type { ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";

/** What list an effect sits in; verbs have a user, an item and a target, rules only a self. */
export type EffectOwner = "verb" | "rule";

const RULE_FORBIDDEN_SUBJECTS = new Set(["target", "user", "item", "chosen"]);
const VERB_ONLY_EFFECTS = new Set(["sleep", "read_notes", "post_note", "produce", "move"]);

export interface EffectCheckContext {
  file: ItemFile;
  definitionIds: ReadonlySet<string>;
  problems: ProblemList;
}

function checkSubject(
  effect: Effect,
  owner: EffectOwner,
  path: string,
  context: EffectCheckContext,
) {
  const { problems } = context;
  if (owner === "verb") {
    if (effect.on === undefined) problems.error(path, "An effect in a verb needs `on`.");
    if (effect.on === "self") {
      problems.error(path, "`on: self` is for rules; a verb has no self.");
    }
  } else if (effect.on !== undefined && RULE_FORBIDDEN_SUBJECTS.has(effect.on)) {
    problems.error(path, `\`on: ${effect.on}\` only works in verbs.`);
  }
  if (effect.on === "nearby" && effect.radius === undefined) {
    problems.error(path, "`on: nearby` needs a `radius`.");
  }
}

function checkRuleOnly(effect: Effect, path: string, problems: ProblemList) {
  if (VERB_ONLY_EFFECTS.has(effect.type)) {
    problems.error(path, `\`${effect.type}\` only works in verbs: a rule has no verb run.`);
  }
  const verbOnlySettings = [
    effect.when !== undefined ? "when" : null,
    effect.requiresHit !== undefined ? "requiresHit" : null,
    effect.type === "damage" && effect.scaledByStrength ? "scaledByStrength" : null,
  ];
  for (const setting of verbOnlySettings) {
    if (setting !== null) problems.error(path, `\`${setting}\` only works in verbs.`);
  }
}

function checkFieldWrite(effect: Effect, path: string, context: EffectCheckContext) {
  if (effect.type !== "set" && effect.type !== "change") return;
  const { file, definitionIds, problems } = context;
  const fieldPath = parseComponentPath(effect.field);
  const field =
    fieldPath === null ? undefined : file.components[fieldPath.component]?.fields[fieldPath.field];
  if (field === undefined) {
    problems.error(path, `Unknown field "${effect.field}".`);
  } else if (effect.type === "change") {
    if (field.type !== "number") {
      problems.error(
        path,
        `\`change\` needs a number field, but ${effect.field} is a ${field.type}.`,
      );
    }
  } else if (!isFittingValue(effect.to, field.type)) {
    problems.error(path, `\`to\` must be a ${field.type} to fit ${effect.field}.`);
  } else if (
    field.type === "item" &&
    typeof effect.to === "string" &&
    !definitionIds.has(effect.to)
  ) {
    problems.error(path, `Unknown item "${effect.to}".`);
  }
}

function isFittingValue(value: number | string | boolean, type: string): boolean {
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  return (type === "text" || type === "item") && typeof value === "string";
}

function checkNames(effect: Effect, path: string, context: EffectCheckContext) {
  const { problems, definitionIds, file } = context;
  if (
    (effect.type === "add_condition" || effect.type === "remove_condition") &&
    !Object.hasOwn(file.components, effect.condition)
  ) {
    problems.error(path, `Unknown component "${effect.condition}".`);
  }
  if (effect.type === "produce" && !definitionIds.has(effect.item)) {
    problems.error(path, `Unknown item "${effect.item}".`);
  }
  if (
    effect.type === "transform" &&
    typeof effect.into === "string" &&
    !definitionIds.has(effect.into)
  ) {
    problems.error(path, `Unknown item "${effect.into}".`);
  }
}

/** Checks one effect's own fields; hits and value reads are checked by the verb or rule. */
export function checkEffect(
  effect: Effect,
  owner: EffectOwner,
  path: string,
  context: EffectCheckContext,
): void {
  checkSubject(effect, owner, path, context);
  checkNames(effect, path, context);
  checkFieldWrite(effect, path, context);
  if (owner === "rule") checkRuleOnly(effect, path, context.problems);
}
