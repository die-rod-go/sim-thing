import {
  describeRuleSubject,
  listAllRuleSubjects,
  listGuaranteedComponents,
  listSubjectsWithAddedComponents,
  matchesRule,
  requiresHeldOrUser,
  resolveBodyDefaults,
  type RuleSubject,
} from "./applies-to";
import { listVerbReads } from "./effect-reads";
import { checkEffect, type EffectCheckContext } from "./effect-validation";
import type { AppliesToRule, ItemDefinition, Verb } from "./item-file";

function describeVerbPath(verb: Verb, index: number): string {
  return `verbs.${index} (${verb.name})`;
}

function listRuleTerms(rule: AppliesToRule): AppliesToRule[] {
  if ("anyOf" in rule) return rule.anyOf.flatMap(listRuleTerms);
  if ("allOf" in rule) return rule.allOf.flatMap(listRuleTerms);
  if ("not" in rule) return listRuleTerms(rule.not);
  return [rule];
}

function checkRuleNames(rule: AppliesToRule, path: string, context: EffectCheckContext) {
  const { file, definitionIds, problems } = context;
  for (const term of listRuleTerms(rule)) {
    if ("definition" in term && !definitionIds.has(term.definition)) {
      problems.error(path, `appliesTo names unknown item "${term.definition}".`);
    }
    if ("component" in term && !Object.hasOwn(file.components, term.component)) {
      problems.error(path, `appliesTo names unknown component "${term.component}".`);
    }
  }
}

function checkRuleReach(
  verb: Verb,
  path: string,
  subjects: RuleSubject[],
  context: EffectCheckContext,
) {
  const matched = subjects.filter((subject) => matchesRule(verb.appliesTo, subject));
  if (matched.some((subject) => subject.kind === "living_agent")) {
    context.problems.error(
      path,
      "appliesTo matches other living agents; people can only be targets, never used.",
    );
  }
  const couldMatch =
    matched.length > 0 ||
    listSubjectsWithAddedComponents(context.file, subjects).some((subject) =>
      matchesRule(verb.appliesTo, subject),
    );
  if (!couldMatch) context.problems.warning(path, "appliesTo matches nothing.");
}

function checkComponentReads(
  verb: Verb,
  path: string,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: EffectCheckContext,
) {
  const guaranteed = listGuaranteedComponents(verb.appliesTo, definitionsById);
  for (const read of listVerbReads(verb)) {
    const where = `${path}.${read.where}`;
    if (!guaranteed.has(read.component)) {
      context.problems.error(
        where,
        `Reads item.${read.component}.${read.field}, but appliesTo doesn't require the ${read.component} component.`,
      );
      continue;
    }
    const field = context.file.components[read.component]?.fields[read.field];
    if (field === undefined) {
      context.problems.error(where, `Component ${read.component} has no field "${read.field}".`);
    } else if (field.type !== read.expectedType) {
      context.problems.error(
        where,
        `${read.component}.${read.field} is a ${field.type}, but this needs a ${read.expectedType}.`,
      );
    }
  }
}

function checkEffects(verb: Verb, path: string, isUserVerb: boolean, context: EffectCheckContext) {
  const { problems } = context;
  verb.effects.forEach((effect, effectIndex) => {
    const effectPath = `${path}.effects.${effectIndex}`;
    checkEffect(effect, "verb", effectPath, context);
    if (effect.when === "start" && effect.requiresHit === true) {
      problems.error(effectPath, "A start effect can't require a hit: the roll comes at finish.");
    }
    if (effect.requiresHit === true && verb.hitRoll === undefined) {
      problems.warning(effectPath, "requiresHit does nothing in a verb without a hitRoll.");
    }
    if (effect.on === "item" && isUserVerb) {
      problems.error(
        effectPath,
        "`on: item` in a verb the user does bare-handed: there's no item.",
      );
    }
    if (effect.on === "target" && verb.target === "none") {
      problems.error(effectPath, "`on: target` in a verb with no target.");
    }
  });
}

function checkPhrases(verb: Verb, path: string, context: EffectCheckContext) {
  const { problems } = context;
  if (verb.hitRoll !== undefined) {
    if (verb.phrases.hit === undefined)
      problems.error(path, "A verb with a hitRoll needs a `hit` phrase.");
    if (verb.phrases.missed === undefined) {
      problems.error(path, "A verb with a hitRoll needs a `missed` phrase.");
    }
  }
  if (
    verb.effects.some((effect) => effect.type === "damage") &&
    verb.phrases.killed === undefined
  ) {
    problems.error(path, "A verb that does damage needs a `killed` phrase to name the death.");
  }
}

function checkItemNames(verb: Verb, path: string, context: EffectCheckContext) {
  const { file, definitionIds, problems } = context;
  for (const definitionId of Object.keys(verb.inputs)) {
    if (!definitionIds.has(definitionId))
      problems.error(`${path}.inputs`, `Unknown item "${definitionId}".`);
  }
  for (const definitionId of verb.tools?.definitions ?? []) {
    if (!definitionIds.has(definitionId))
      problems.error(`${path}.tools`, `Unknown item "${definitionId}".`);
  }
  for (const component of verb.tools?.components ?? []) {
    if (!Object.hasOwn(file.components, component)) {
      problems.error(`${path}.tools`, `Unknown component "${component}".`);
    }
  }
}

/** Same-named verbs must never both apply to the same kind of thing in the same place. */
function checkOverlaps(
  verbs: readonly Verb[],
  subjects: RuleSubject[],
  context: EffectCheckContext,
) {
  verbs.forEach((verb, index) => {
    verbs.slice(0, index).forEach((earlier) => {
      if (earlier.name.trim().toLowerCase() !== verb.name.trim().toLowerCase()) return;
      const shared = subjects.find(
        (subject) =>
          matchesRule(verb.appliesTo, subject) && matchesRule(earlier.appliesTo, subject),
      );
      if (shared === undefined) return;
      context.problems.error(
        describeVerbPath(verb, index),
        `Another "${verb.name}" verb also applies to ${describeRuleSubject(shared)}; narrow one rule with \`not\`.`,
      );
    });
  });
}

export function checkVerbs(
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: EffectCheckContext,
): void {
  const { file } = context;
  const subjects = listAllRuleSubjects(file);
  const user: RuleSubject = { kind: "user", components: resolveBodyDefaults(file) };
  file.verbs.forEach((verb, index) => {
    const path = describeVerbPath(verb, index);
    checkRuleNames(verb.appliesTo, `${path}.appliesTo`, context);
    checkRuleReach(verb, `${path}.appliesTo`, subjects, context);
    if (verb.target !== "none" && !requiresHeldOrUser(verb.appliesTo)) {
      context.problems.error(
        `${path}.appliesTo`,
        "An aimed verb's rule must require `location: held` or `isUser`, so `target` is free for what it's aimed at.",
      );
    }
    checkComponentReads(verb, path, definitionsById, context);
    checkEffects(verb, path, matchesRule(verb.appliesTo, user), context);
    checkPhrases(verb, `${path}.phrases`, context);
    checkItemNames(verb, path, context);
  });
  checkOverlaps(file.verbs, subjects, context);
}
