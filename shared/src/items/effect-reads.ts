import type { FieldType } from "./component-schema";
import {
  ITEM_VALUE_PATH_PATTERN,
  type Effect,
  type NumberValue,
  type RangeValue,
  type TextValue,
} from "./effect-schema";
import type { Verb } from "./item-file";

/** One place a verb reads a component field, and the field type that slot needs. */
export interface ComponentRead {
  component: string;
  field: string;
  expectedType: FieldType;
  /** Where in the verb, for problem messages ("effects.0.amount"). */
  where: string;
}

function parsePath(path: string): { component: string; field: string } | null {
  const match = ITEM_VALUE_PATH_PATTERN.exec(path);
  if (!match?.[1] || !match[2]) return null;
  return { component: match[1], field: match[2] };
}

function readFrom(path: string, expectedType: FieldType, where: string): ComponentRead[] {
  const parsed = parsePath(path);
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
    default:
      return [];
  }
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
