import {
  describeNamedThing,
  findStepAs,
  listGuaranteedComponents,
  resolveBodyDefaults,
  type FieldType,
  type Matcher,
  type Step,
} from "@village/shared";
import type { StepOwner, ValueSpot } from "./step-owner";

export type ValueKind = "number" | "factor" | "range" | "text" | "definition" | "boolean";

const FIELD_TYPES_OF_KIND: Record<ValueKind, readonly FieldType[]> = {
  number: ["number", "range"],
  factor: ["number"],
  range: ["range"],
  text: ["text"],
  definition: ["item"],
  boolean: ["boolean"],
};

const NUMBER_KINDS: readonly ValueKind[] = ["number", "factor"];

export function listOwnerSteps(owner: StepOwner): readonly Step[] {
  return owner.kind === "verb" ? owner.verb.steps : owner.rule.steps;
}

/** `as` names given by steps before the spot, each with a matcher what it names is sure to meet. */
export function listGivenNames(spot: ValueSpot): Map<string, Matcher> {
  const givenNames = new Map<string, Matcher>();
  if (spot.stepIndex === null) return givenNames;
  for (const step of listOwnerSteps(spot.owner).slice(0, spot.stepIndex)) {
    const name = findStepAs(step);
    if (name !== undefined) givenNames.set(name, describeNamedThing(step));
  }
  return givenNames;
}

/** Names a step may work on, or a value may read, at the spot (not `nearby` or `earshot`). */
export function listThingNames(spot: ValueSpot): string[] {
  const { owner } = spot;
  if (owner.kind === "rule") return ["self"];
  return [
    "user",
    ...(owner.verb.appliesTo === undefined ? [] : ["item"]),
    ...(owner.verb.target === undefined ? [] : ["target"]),
    ...listGivenNames(spot).keys(),
  ];
}

function findNamingMatcher(spot: ValueSpot, who: string): Matcher | undefined {
  const { owner } = spot;
  if (who === "item") return owner.kind === "verb" ? owner.verb.appliesTo : undefined;
  if (who === "target") return owner.kind === "verb" ? owner.verb.target : undefined;
  if (who === "self") return owner.kind === "rule" ? owner.rule.if : undefined;
  return listGivenNames(spot).get(who);
}

/** Components every thing the name could be is sure to have. */
export function listGuaranteedComponentsOf(spot: ValueSpot, who: string): string[] {
  if (who === "user") {
    return spot.owner.kind === "verb" ? Object.keys(resolveBodyDefaults(spot.file)) : [];
  }
  const matcher = findNamingMatcher(spot, who);
  if (matcher === undefined) return [];
  const definitionsById = new Map(
    spot.file.definitions.map((definition) => [definition.id, definition]),
  );
  return [...listGuaranteedComponents(matcher, definitionsById)];
}

function listChoicePaths(spot: ValueSpot, kind: ValueKind): string[] {
  const { owner } = spot;
  if (owner.kind === "rule") return [];
  if (NUMBER_KINDS.includes(kind)) {
    return ["choice.amount", ...(owner.verb.takes.includes("minutes") ? ["choice.minutes"] : [])];
  }
  return kind === "text" && owner.verb.takes.includes("text") ? ["choice.text"] : [];
}

/** Every value path a value of the kind may read at the spot, as the schema's reads allow. */
export function listReadablePaths(spot: ValueSpot, kind: ValueKind): string[] {
  const accepted = FIELD_TYPES_OF_KIND[kind];
  const fieldPaths = listThingNames(spot).flatMap((who) =>
    listGuaranteedComponentsOf(spot, who).flatMap((component) =>
      Object.entries(spot.file.components[component]?.fields ?? {})
        .filter(([, field]) => accepted.includes(field.type))
        .map(([field]) => `${who}.${component}.${field}`),
    ),
  );
  const namePaths = kind === "text" ? listThingNames(spot).map((who) => `${who}.name`) : [];
  return [...fieldPaths, ...namePaths, ...listChoicePaths(spot, kind)];
}
