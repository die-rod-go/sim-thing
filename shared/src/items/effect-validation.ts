import { listEffectReads } from "./effect-reads";
import type { Effect } from "./effect-schema";
import type { ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";

/** What kind of rule list an effect sits in; verbs allow more `on` values than the others. */
export type EffectOwner = "verb" | "condition" | "reaction" | "on_broken";

const VERB_ONLY_SUBJECTS = new Set(["target", "user", "item", "chosen"]);

export interface EffectCheckContext {
  file: ItemFile;
  definitionIds: ReadonlySet<string>;
  conditionNames: ReadonlySet<string>;
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
      problems.error(path, "`on: self` is for conditions and reactions; a verb has no self.");
    }
  } else if (effect.on !== undefined && VERB_ONLY_SUBJECTS.has(effect.on)) {
    problems.error(path, `\`on: ${effect.on}\` only works in verbs.`);
  }
  if (effect.on === "nearby" && effect.radius === undefined) {
    problems.error(path, "`on: nearby` needs a `radius`.");
  }
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
  if (effect.type === "transform" && !definitionIds.has(effect.into)) {
    problems.error(path, `Unknown item "${effect.into}".`);
  }
}

/** Checks one effect's own fields; verb-specific checks (hits, reads) are done by the verb. */
export function checkEffect(
  effect: Effect,
  owner: EffectOwner,
  path: string,
  context: EffectCheckContext,
): void {
  checkSubject(effect, owner, path, context);
  checkNames(effect, path, context);
  if (owner !== "verb" && listEffectReads(effect, path).length > 0) {
    context.problems.error(path, "Only verbs can read numbers from components.");
  }
}

/** Whether an effect damages whatever carries the condition or reaction (needs a killed phrase). */
export function damagesSelf(effect: Effect): boolean {
  return effect.type === "damage" && (effect.on === undefined || effect.on === "self");
}
