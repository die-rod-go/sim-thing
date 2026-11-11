import { parseComponentPath, type FieldType } from "./component-schema";
import type { Rule, Verb } from "./item-file";
import type { Step } from "./step-schema";
import {
  parseValuePath,
  type DefinitionValue,
  type FieldValueInput,
  type NumberValue,
  type TextValue,
  type ValuePath,
} from "./value-schema";

/** What a slot accepts: some field types, or whatever type another field has. */
export type ReadExpectation =
  | { kind: "types"; types: readonly FieldType[] }
  | { kind: "fieldOf"; component: string; field: string };

/** One place a verb or rule reads a value, and what the slot needs. */
export interface StepRead {
  path: ValuePath;
  expectation: ReadExpectation;
  /** Where in the verb or rule, for problem messages ("steps.0.amount"). */
  where: string;
}

const NUMBER_SLOT: ReadExpectation = { kind: "types", types: ["number", "range"] };
const FACTOR_SLOT: ReadExpectation = { kind: "types", types: ["number"] };
const TEXT_SLOT: ReadExpectation = { kind: "types", types: ["text"] };
const DEFINITION_SLOT: ReadExpectation = { kind: "types", types: ["item"] };

function readFrom(path: string, expectation: ReadExpectation, where: string): StepRead[] {
  const parsed = parseValuePath(path);
  return parsed === null ? [] : [{ path: parsed, expectation, where }];
}

function listFactorReads(times: number | string | undefined, where: string): StepRead[] {
  return typeof times === "string" ? readFrom(times, FACTOR_SLOT, `${where}.times`) : [];
}

function listSlotReads(
  value: NumberValue | FieldValueInput | undefined,
  expectation: ReadExpectation,
  where: string,
): StepRead[] {
  if (value === undefined || typeof value !== "object") return [];
  if ("from" in value) {
    return [...readFrom(value.from, expectation, where), ...listFactorReads(value.times, where)];
  }
  return listFactorReads(value.times, where);
}

export function listNumberReads(value: NumberValue | undefined, where: string): StepRead[] {
  return listSlotReads(value, NUMBER_SLOT, where);
}

export function listTextReads(value: TextValue | undefined, where: string): StepRead[] {
  if (value === undefined || typeof value === "string") return [];
  return readFrom(value.from, TEXT_SLOT, where);
}

export function listDefinitionReads(value: DefinitionValue | undefined, where: string): StepRead[] {
  if (value === undefined || typeof value === "string") return [];
  return readFrom(value.from, DEFINITION_SLOT, where);
}

function listFieldInputReads(
  value: FieldValueInput,
  componentPath: string,
  where: string,
): StepRead[] {
  const target = parseComponentPath(componentPath);
  if (target === null) return [];
  return listSlotReads(value, { kind: "fieldOf", ...target }, where);
}

function listFieldMapReads(
  fields: Record<string, FieldValueInput> | undefined,
  toPath: (key: string) => string,
  where: string,
): StepRead[] {
  return Object.entries(fields ?? {}).flatMap(([key, value]) =>
    listFieldInputReads(value, toPath(key), `${where}.${key}`),
  );
}

/** Every value a step reads, with the type each slot needs. */
export function listStepReads(step: Step, where: string): StepRead[] {
  switch (step.step) {
    case "wait":
      return [
        ...listNumberReads(step.minutes, `${where}.minutes`),
        ...listNumberReads(step.loudness, `${where}.loudness`),
      ];
    case "sleep":
      return listNumberReads(step.minutes, `${where}.minutes`);
    case "roll_hit":
      return listNumberReads(step.chance, `${where}.chance`);
    case "change":
      return listNumberReads(step.by, `${where}.by`);
    case "damage":
      return listNumberReads(step.amount, `${where}.amount`);
    case "set":
      return listFieldInputReads(step.to, step.field, `${where}.to`);
    case "add":
      return [
        ...listNumberReads(step.minutes, `${where}.minutes`),
        ...listFieldMapReads(step.fields, (key) => `${step.component}.${key}`, `${where}.fields`),
      ];
    case "move":
      return listNumberReads(step.limit, `${where}.limit`);
    case "create":
      return [
        ...listDefinitionReads(step.item, `${where}.item`),
        ...listNumberReads(step.count, `${where}.count`),
        ...listNumberReads(step.limit, `${where}.limit`),
        ...listFieldMapReads(step.fields, (key) => key, `${where}.fields`),
      ];
    case "transform":
      return listDefinitionReads(step.into, `${where}.into`);
    case "send":
      return listTextReads(step.stimulus, `${where}.stimulus`);
    case "sound":
      return listNumberReads(step.loudness, `${where}.loudness`);
    case "change_need":
      return [
        ...listNumberReads(step.amount, `${where}.amount`),
        ...listNumberReads(step.perOtherUser, `${where}.perOtherUser`),
      ];
    default:
      return [];
  }
}

function listStepsReads(steps: readonly Step[]): StepRead[] {
  return steps.flatMap((step, index) => listStepReads(step, `steps.${index}`));
}

/** Every value a rule reads, in its steps. */
export function listRuleReads(rule: Rule): StepRead[] {
  return listStepsReads(rule.steps);
}

/** The reads outside the steps: how far a verb reaches. */
export function listReachReads(verb: Verb): StepRead[] {
  return listNumberReads(verb.reach, "reach");
}

/** Every value a verb reads: its reach and its steps. */
export function listVerbReads(verb: Verb): StepRead[] {
  return [...listReachReads(verb), ...listStepsReads(verb.steps)];
}
