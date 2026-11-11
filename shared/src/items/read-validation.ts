import type { FieldType } from "./component-schema";
import type { StepRead } from "./step-reads";
import { resolveThing, type StepScope, type ThingResolution } from "./step-scope";
import type { ChoiceName } from "./value-schema";

const CHOICE_TYPES: Record<ChoiceName, FieldType> = {
  amount: "number",
  minutes: "number",
  text: "text",
};

function describeSource(who: string): string {
  if (who === "item") return "appliesTo";
  if (who === "target") return "target";
  if (who === "self") return "`if`";
  if (who === "user") return "the agent body";
  return "the `rule` that named it";
}

function listAcceptedTypes(read: StepRead, scope: StepScope): readonly FieldType[] | null {
  const { expectation } = read;
  if (expectation.kind === "types") return expectation.types;
  const field = scope.context.file.components[expectation.component]?.fields[expectation.field];
  if (field === undefined) return null;
  return field.type === "number" ? ["number", "range"] : [field.type];
}

function checkType(
  read: StepRead,
  actual: FieldType,
  name: string,
  where: string,
  scope: StepScope,
) {
  const accepted = listAcceptedTypes(read, scope);
  if (accepted === null || accepted.includes(actual)) return;
  scope.context.problems.error(where, `${name} is a ${actual}, but this needs a ${accepted[0]}.`);
}

function checkChoice(read: StepRead, choice: ChoiceName, where: string, scope: StepScope) {
  const { owner, context } = scope;
  const name = `choice.${choice}`;
  if (owner.kind === "rule") {
    context.problems.error(where, `Reads ${name}, but a rule has no choice.`);
    return;
  }
  if (choice !== "amount" && !owner.verb.takes.includes(choice)) {
    context.problems.error(where, `Reads ${name}, but the verb doesn't list "${choice}" in takes.`);
    return;
  }
  checkType(read, CHOICE_TYPES[choice], name, where, scope);
}

function checkFieldRead(
  read: StepRead,
  who: string,
  component: string,
  field: string,
  thing: Extract<ThingResolution, { ok: true }>,
  where: string,
  scope: StepScope,
) {
  const { problems, file } = scope.context;
  const name = `${who}.${component}.${field}`;
  if (!thing.guaranteed.has(component)) {
    problems.error(
      where,
      `Reads ${name}, but ${describeSource(who)} doesn't require the ${component} component.`,
    );
    return;
  }
  const declared = file.components[component]?.fields[field];
  if (declared === undefined) {
    problems.error(where, `Component ${component} has no field "${field}".`);
    return;
  }
  checkType(read, declared.type, `${component}.${field}`, where, scope);
}

/**
 * A read must name a thing the owner has, a component that thing is sure to have, a field of the
 * right type for the slot, and a choice the verb takes.
 */
export function checkStepRead(read: StepRead, pathPrefix: string, scope: StepScope): void {
  const where = `${pathPrefix}.${read.where}`;
  const { path } = read;
  if (path.kind === "choice") {
    checkChoice(read, path.choice, where, scope);
    return;
  }
  const thing = resolveThing(scope, path.who);
  if (!thing.ok) {
    scope.context.problems.error(where, `Reads ${path.who}: ${thing.problem}`);
  } else if (path.kind === "name") {
    checkType(read, "text", `${path.who}.name`, where, scope);
  } else {
    checkFieldRead(read, path.who, path.component, path.field, thing, where, scope);
  }
}
