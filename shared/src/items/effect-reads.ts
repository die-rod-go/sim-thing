import type { FieldType } from "./component-schema";
import {
  parseValuePath,
  type DefinitionValue,
  type Effect,
  type NumberValue,
  type RangeValue,
  type TextValue,
  type ValuePathSubject,
} from "./effect-schema";
import type { Rule, Verb } from "./item-file";

/** One place a verb or rule reads a component field, and the field type that slot needs. */
export interface ComponentRead {
  /** `item` for the thing a verb is used with, `self` for the thing a rule fired on. */
  who: ValuePathSubject;
  component: string;
  field: string;
  expectedType: FieldType;
  /** Where in the verb, for problem messages ("effects.0.amount"). */
  where: string;
}

function readFrom(path: string, expectedType: FieldType, where: string): ComponentRead[] {
  const parsed = parseValuePath(path);
  return parsed ? [{ ...parsed, expectedType, where }] : [];
}

export function listNumberReads(value: NumberValue | null, where: string): ComponentRead[] {
  if (value === null || typeof value === "number") return [];
  if ("from" in value) return readFrom(value.from, "number", where);
  return readFrom(value.times, "number", where);
}

export function listRangeReads(value: RangeValue, where: string): ComponentRead[] {
  if ("from" in value) return readFrom(value.from, "range", where);
  return value.times === undefined ? [] : readFrom(value.times, "number", where);
}

export function listDefinitionReads(value: DefinitionValue, where: string): ComponentRead[] {
  return typeof value === "string" ? [] : readFrom(value.from, "item", where);
}

export function listTextReads(value: TextValue | undefined, where: string): ComponentRead[] {
  if (value === undefined || typeof value === "string") return [];
  return readFrom(value.from, "text", where);
}

/** Every component field an effect reads. */
export function listEffectReads(effect: Effect, where: string): ComponentRead[] {
  switch (effect.type) {
    case "damage":
      return [
        ...listRangeReads(effect.amount, `${where}.amount`),
        ...listTextReads(effect.stimulus, `${where}.stimulus`),
      ];
    case "heal":
    case "wear":
    case "take_stock":
      return listNumberReads(effect.amount, `${where}.amount`);
    case "change_need":
      return [
        ...listNumberReads(effect.amount, `${where}.amount`),
        ...listNumberReads(effect.perOtherUser ?? null, `${where}.perOtherUser`),
      ];
    case "emit":
      return listTextReads(effect.stimulus, `${where}.stimulus`);
    case "add_condition":
      return listNumberReads(effect.minutes ?? null, `${where}.minutes`);
    case "produce":
      return listNumberReads(effect.count, `${where}.count`);
    case "make_sound":
      return listNumberReads(effect.loudness, `${where}.loudness`);
    case "change":
      return listNumberReads(effect.by, `${where}.by`);
    case "transform":
      return listDefinitionReads(effect.into, `${where}.into`);
    default:
      return [];
  }
}

/** Every component field a rule reads, in its effects. */
export function listRuleReads(rule: Rule): ComponentRead[] {
  return rule.effects.flatMap((effect, index) => listEffectReads(effect, `effects.${index}`));
}

/** Every component field a verb reads, in its numbers and its effects. */
export function listVerbReads(verb: Verb): ComponentRead[] {
  return [
    ...listNumberReads(verb.reach, "reach"),
    ...listNumberReads(verb.minutes, "minutes"),
    ...listNumberReads(verb.loudness, "loudness"),
    ...listNumberReads(verb.hitRoll?.baseHitChance ?? null, "hitRoll.baseHitChance"),
    ...verb.effects.flatMap((effect, index) => listEffectReads(effect, `effects.${index}`)),
  ];
}
