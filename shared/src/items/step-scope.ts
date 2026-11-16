import { resolveBodyDefaults } from "./applies-to";
import type { ItemDefinition, Rule, Verb } from "./item-file";
import type { ValidationContext } from "./item-problems";
import type { Matcher } from "./matcher-schema";
import { couldMatchAfterSteps } from "./matcher-validation";
import { listGuaranteedComponents } from "./matchers";
import type { KnownThings } from "./step-blocks";
import { findStepAs, type Step } from "./step-schema";
import { isFanOutName } from "./value-schema";

/** What list of steps is being checked: a verb has a user, an item and a target; a rule only a self. */
export type StepOwner = { kind: "verb"; verb: Verb } | { kind: "rule"; rule: Rule };

/**
 * What the steps checked so far tell: each `as` name with a matcher every pick of it meets (the
 * `rule` that picked it, or the definition `create` made it of), and what `transform` changed.
 */
export interface StepScope extends KnownThings {
  owner: StepOwner;
  context: ValidationContext;
  definitionsById: ReadonlyMap<string, ItemDefinition>;
  /** Every `as` name in the list, including those given by later steps. */
  plannedNames: ReadonlySet<string>;
}

export function buildStepScope(
  owner: StepOwner,
  steps: readonly Step[],
  context: ValidationContext,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
): StepScope {
  const plannedNames = new Set<string>();
  for (const step of steps) {
    const name = findStepAs(step);
    if (name !== undefined) plannedNames.add(name);
  }
  return {
    owner,
    context,
    definitionsById,
    givenNames: new Map(),
    plannedNames,
    transformedRoles: new Map(),
    blockNames: new Set(),
  };
}

/** A thing a step names, and what is known about it. */
export type ThingResolution =
  | {
      ok: true;
      /** Components every match is sure to have. */
      guaranteed: ReadonlySet<string>;
      /** The matcher that picks it; null for the user's body. */
      matcher: Matcher | null;
    }
  | { ok: false; problem: string };

function unavailable(problem: string): ThingResolution {
  return { ok: false, problem };
}

function resolveMatched(
  scope: StepScope,
  matcher: Matcher | undefined,
  missingProblem: string,
): ThingResolution {
  if (matcher === undefined) return unavailable(missingProblem);
  return {
    ok: true,
    guaranteed: listGuaranteedComponents(matcher, scope.definitionsById),
    matcher,
  };
}

function resolveUser(scope: StepScope): ThingResolution {
  if (scope.owner.kind === "rule")
    return unavailable("`user` only works in verbs: a rule has no user.");
  return {
    ok: true,
    guaranteed: new Set(Object.keys(resolveBodyDefaults(scope.context.file))),
    matcher: null,
  };
}

function resolveRole(scope: StepScope, name: string): ThingResolution | null {
  const { owner } = scope;
  if (name === "user") return resolveUser(scope);
  if (name === "item") {
    if (owner.kind === "rule")
      return unavailable("`item` only works in verbs: a rule has no item.");
    return resolveMatched(
      scope,
      owner.verb.appliesTo,
      "`item` needs the verb to have `appliesTo`.",
    );
  }
  if (name === "target") {
    if (owner.kind === "rule") {
      return unavailable("`target` only works in verbs: a rule has no target.");
    }
    return resolveMatched(scope, owner.verb.target, "`target` needs the verb to have a `target`.");
  }
  if (name === "self") {
    if (owner.kind === "verb") return unavailable("`self` is for rules; a verb has no self.");
    return resolveMatched(scope, owner.rule.if, "A rule has no `if`.");
  }
  if (isFanOutName(name)) {
    return unavailable(`\`${name}\` only works in \`on\`.`);
  }
  return null;
}

/** Whether the name is a role the owner has, or an `as` name an earlier step gave. */
export function resolveThing(scope: StepScope, name: string): ThingResolution {
  const role = resolveRole(scope, name);
  if (role !== null) {
    const transformed = scope.transformedRoles.get(name);
    return role.ok && transformed !== undefined ? resolveMatched(scope, transformed, "") : role;
  }
  const matcher = scope.givenNames.get(name);
  if (matcher !== undefined) return resolveMatched(scope, matcher, "");
  if (scope.blockNames.has(name)) {
    return unavailable(
      `"${name}" is named in only one branch of an \`if\` block, so it may not exist here.`,
    );
  }
  if (scope.plannedNames.has(name)) {
    return unavailable(`"${name}" is used before the step that names it.`);
  }
  return unavailable(`Unknown name "${name}": no earlier step names it with \`as\`.`);
}

function listBodyViews(scope: StepScope) {
  const { file } = scope.context;
  const body = { definitionId: file.world.agentBody, components: resolveBodyDefaults(file) };
  return [{ ...body, where: "here" as const }, { ...body, where: "self" as const }, body];
}

/** Whether the thing a step names could be an agent's body. A fan-out and the user always could. */
export function couldReachBody(scope: StepScope, name: string): boolean {
  if (isFanOutName(name)) return true;
  const thing = resolveThing(scope, name);
  if (!thing.ok) return false;
  return (
    thing.matcher === null ||
    couldMatchAfterSteps(scope.context.file, thing.matcher, listBodyViews(scope))
  );
}
