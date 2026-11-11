import { listDefinitionViews } from "./applies-to";
import { resolveComponents } from "./components";
import type { ItemDefinition, ItemFile, Rule, Verb } from "./item-file";
import type { ProblemList } from "./item-problems";
import type { Matcher } from "./matcher-schema";
import { matchesThing } from "./matchers";
import type { Step } from "./step-schema";
import { parseValuePath, type DefinitionValue } from "./value-schema";

function listFieldValues(file: ItemFile, path: string): unknown[] {
  const parsed = parseValuePath(path);
  if (parsed?.kind !== "field") return [];
  return file.definitions.map(
    (definition) =>
      resolveComponents(file.components, definition, {})[parsed.component]?.[parsed.field],
  );
}

function makesDefinition(file: ItemFile, value: DefinitionValue, suppliedId: string): boolean {
  if (typeof value === "string") return value === suppliedId;
  return listFieldValues(file, value.from).includes(suppliedId);
}

function getSubject(owner: { verb: Verb } | { rule: Rule }, name: string): Matcher | null {
  if ("rule" in owner) return name === "self" ? owner.rule.if : null;
  const { verb } = owner;
  if (name === "item") return verb.appliesTo ?? null;
  if (name === "target") return verb.target ?? null;
  for (const step of verb.steps) {
    if ((step.step === "require" || step.step === "use_up") && step.as === name) return step.rule;
  }
  return null;
}

function isConservative(name: string): boolean {
  return name === "nearby" || name === "user";
}

function couldMatchSupplied(
  file: ItemFile,
  supplied: ItemDefinition,
  owner: { verb: Verb } | { rule: Rule },
  name: string,
): boolean {
  if (isConservative(name)) return true;
  const matcher = getSubject(owner, name);
  if (matcher === null) return false;
  if ("rule" in owner) {
    const view = {
      definitionId: supplied.id,
      components: resolveComponents(file.components, supplied, {}),
    };
    return matchesThing(matcher, view);
  }
  return listDefinitionViews(file, supplied).some((view) => matchesThing(matcher, view));
}

type Owner = { verb: Verb } | { rule: Rule };

function findSupplyProblem(
  file: ItemFile,
  supplied: ItemDefinition,
  owner: Owner,
  step: Step,
): string | null {
  if (step.step === "create" && makesDefinition(file, step.item, supplied.id)) {
    return `Makes ${supplied.id}, so the supply isn't closed.`;
  }
  if (step.step === "transform" && makesDefinition(file, step.into, supplied.id)) {
    return `Makes ${supplied.id}, so the supply isn't closed.`;
  }
  const isRemoving =
    (step.step === "destroy" || step.step === "transform") &&
    couldMatchSupplied(file, supplied, owner, step.on ?? "self");
  if (isRemoving) return `Could destroy ${supplied.id}, so the supply isn't closed.`;
  if (step.step === "use_up") {
    const view = {
      definitionId: supplied.id,
      components: resolveComponents(file.components, supplied, {}),
    };
    if (matchesThing(step.rule, view)) return `Uses up ${supplied.id}, so the supply isn't closed.`;
  }
  return null;
}

function checkOwnerSupply(
  file: ItemFile,
  supplied: ItemDefinition,
  owner: Owner,
  steps: readonly Step[],
  path: string,
  problems: ProblemList,
) {
  steps.forEach((step, index) => {
    const message = findSupplyProblem(file, supplied, owner, step);
    if (message !== null) problems.warning(`${path}.steps.${index}`, message);
  });
}

/**
 * Warns about anything that could make or destroy a thing the world setting `closedSupply`
 * matches: a `create` or `transform` into it, or a `destroy`, `use_up` or `transform` whose
 * subject could be it. A closed supply only changes hands.
 */
export function checkClosedSupply(file: ItemFile, problems: ProblemList): void {
  const matcher = file.world.closedSupply;
  if (matcher === undefined) return;
  const supplied = file.definitions.filter((definition) =>
    matchesThing(matcher, {
      definitionId: definition.id,
      components: resolveComponents(file.components, definition, {}),
    }),
  );
  for (const definition of supplied) {
    file.verbs.forEach((verb, index) =>
      checkOwnerSupply(
        file,
        definition,
        { verb },
        verb.steps,
        `verbs.${index} (${verb.name})`,
        problems,
      ),
    );
    file.rules.forEach((rule, index) =>
      checkOwnerSupply(file, definition, { rule }, rule.steps, `rules.${index}`, problems),
    );
  }
}
