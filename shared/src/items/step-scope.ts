import { resolveBodyDefaults } from "./applies-to";
import type { ItemDefinition, Rule, Verb } from "./item-file";
import type { ValidationContext } from "./item-problems";
import type { Matcher } from "./matcher-schema";
import { couldMatchAnyView, listViewsAfterSteps } from "./matcher-validation";
import { listGuaranteedComponents } from "./matchers";
import type { Step } from "./step-schema";

/** What list of steps is being checked: a verb has a user, an item and a target; a rule only a self. */
export type StepOwner = { kind: "verb"; verb: Verb } | { kind: "rule"; rule: Rule };

export interface StepScope {
  owner: StepOwner;
  context: ValidationContext;
  definitionsById: ReadonlyMap<string, ItemDefinition>;
  /** `as` names given by the steps checked so far, with the `rule` that picked each. */
  givenNames: Map<string, Matcher>;
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
    if ((step.step === "require" || step.step === "use_up") && step.as !== undefined) {
      plannedNames.add(step.as);
    }
  }
  return { owner, context, definitionsById, givenNames: new Map(), plannedNames };
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
  if (name === "nearby") return unavailable("`nearby` only works in `on`.");
  return null;
}

/** Whether the name is a role the owner has, or an `as` name an earlier step gave. */
export function resolveThing(scope: StepScope, name: string): ThingResolution {
  const role = resolveRole(scope, name);
  if (role !== null) return role;
  const matcher = scope.givenNames.get(name);
  if (matcher !== undefined) return resolveMatched(scope, matcher, "");
  if (scope.plannedNames.has(name)) {
    return unavailable(`"${name}" is used before the step that names it.`);
  }
  return unavailable(`Unknown name "${name}": no earlier step names it with \`as\`.`);
}

function listBodyViews(scope: StepScope) {
  const { file } = scope.context;
  const body = { definitionId: file.world.agentBody, components: resolveBodyDefaults(file) };
  return listViewsAfterSteps(file, [{ ...body, where: "here" }, { ...body, where: "self" }, body]);
}

/** Whether the thing a step names could be an agent's body. `nearby` and the user always could. */
export function couldReachBody(scope: StepScope, name: string): boolean {
  if (name === "nearby") return true;
  const thing = resolveThing(scope, name);
  if (!thing.ok) return false;
  return thing.matcher === null || couldMatchAnyView(thing.matcher, listBodyViews(scope));
}
