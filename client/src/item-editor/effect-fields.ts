import {
  EFFECT_SUBJECTS,
  effectSchema,
  NEED_NAMES,
  type Effect,
  type EffectSubject,
  type EffectType,
  type ItemFile,
} from "@village/shared";
import { clientConfig } from "../client-config";

/** What kind of input an effect field gets in the editor. */
export type EffectFieldKind =
  | "number"
  | "optional_number"
  | "range"
  | "stimulus"
  | "optional_stimulus"
  | "boolean"
  | "need"
  | "condition"
  | "definition"
  | "choice";

export interface EffectFieldSpec {
  key: string;
  kind: EffectFieldKind;
  /** The values a `choice` field takes. */
  choices?: readonly string[];
}

/**
 * The fields each effect type takes beyond the shared modifiers (`on`, `chance`, `when`,
 * `requiresHit`, `radius`), so an effect row shows only those. A test keeps it in step with the
 * schema.
 */
export const EFFECT_FIELD_SPECS: Record<EffectType, readonly EffectFieldSpec[]> = {
  damage: [
    { key: "amount", kind: "range" },
    { key: "stimulus", kind: "optional_stimulus" },
    { key: "scaledByStrength", kind: "boolean" },
  ],
  heal: [{ key: "amount", kind: "number" }],
  change_need: [
    { key: "need", kind: "need" },
    { key: "amount", kind: "number" },
    { key: "perOtherUser", kind: "optional_number" },
  ],
  emit: [{ key: "stimulus", kind: "stimulus" }],
  add_condition: [
    { key: "condition", kind: "condition" },
    { key: "minutes", kind: "optional_number" },
  ],
  remove_condition: [{ key: "condition", kind: "condition" }],
  produce: [
    { key: "item", kind: "definition" },
    { key: "count", kind: "number" },
    { key: "into", kind: "choice", choices: ["user", "ground"] },
  ],
  wear: [{ key: "amount", kind: "number" }],
  transform: [{ key: "into", kind: "definition" }],
  destroy: [],
  take_stock: [{ key: "amount", kind: "number" }],
  set_open: [{ key: "isOpen", kind: "boolean" }],
  move: [{ key: "to", kind: "choice", choices: ["ground", "user", "item", "target_tile"] }],
  make_sound: [{ key: "loudness", kind: "number" }],
  sleep: [],
  read_notes: [],
  post_note: [],
};

export const EFFECT_TYPES = Object.keys(EFFECT_FIELD_SPECS) as EffectType[];

/** Modifiers kept behind the "more" toggle of an effect row. */
export const MORE_MODIFIER_KEYS = ["chance", "when", "requiresHit"] as const;

/** Where an effect list sits: verbs aim at more subjects than conditions, reactions and onBroken. */
export type EffectOwner = "verb" | "condition" | "reaction" | "on_broken";

const VERB_SUBJECTS: readonly EffectSubject[] = ["target", "user", "item", "chosen", "nearby"];
const SELF_SUBJECTS: readonly EffectSubject[] = ["self", "nearby"];

export function listSubjectsForOwner(owner: EffectOwner): readonly EffectSubject[] {
  const subjects = owner === "verb" ? VERB_SUBJECTS : SELF_SUBJECTS;
  return EFFECT_SUBJECTS.filter((subject) => subjects.includes(subject));
}

function buildDefaultFieldValue(spec: EffectFieldSpec, file: ItemFile, stimuli: string[]): unknown {
  const { itemEditor } = clientConfig;
  switch (spec.kind) {
    case "number":
      return 0;
    case "range":
      return { min: 0, max: 0 };
    case "stimulus":
      return stimuli[0] ?? itemEditor.newStimulusName;
    case "boolean":
      return false;
    case "need":
      return NEED_NAMES[0];
    case "condition":
      return file.conditions[0]?.name ?? itemEditor.newConditionName;
    case "definition":
      return file.definitions[0]?.id ?? itemEditor.newDefinitionId;
    case "choice":
      return spec.choices?.[0];
    case "optional_number":
    case "optional_stimulus":
      return undefined;
  }
}

/** A new effect of the type with every required field filled, aimed at the owner's usual subject. */
export function buildEffect(
  type: EffectType,
  owner: EffectOwner,
  file: ItemFile,
  stimuli: string[],
): Effect {
  const fields = Object.fromEntries(
    EFFECT_FIELD_SPECS[type]
      .map((spec) => [spec.key, buildDefaultFieldValue(spec, file, stimuli)] as const)
      .filter(([, value]) => value !== undefined),
  );
  return effectSchema.parse({ type, ...(owner === "verb" ? { on: "user" } : {}), ...fields });
}

/** The effect with one field set, or removed when `value` is undefined. */
export function setEffectField(effect: Effect, key: string, value: unknown): Effect {
  const fields: Record<string, unknown> = { ...effect, [key]: value };
  if (value === undefined) delete fields[key];
  // Keys come from the effect type's own spec or its modifiers, so the shape still matches its type.
  return fields as Effect;
}

export function readEffectField(effect: Effect, key: string): unknown {
  return Object.entries(effect).find(([fieldKey]) => fieldKey === key)?.[1];
}

export function hasMoreModifiers(effect: Effect): boolean {
  return MORE_MODIFIER_KEYS.some((key) => effect[key] !== undefined);
}
