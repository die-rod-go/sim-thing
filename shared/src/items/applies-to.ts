import { resolveComponents, type ResolvedComponents } from "./components";
import type { Effect } from "./effect-schema";
import type { AppliesToRule, ItemDefinition, ItemFile } from "./item-file";
import { matchesThing } from "./matchers";

/** Where an entity is relative to the agent who would use it. `inside` matches no location term. */
export type SubjectLocation = "held" | "ground" | "placed" | "inside";

export const SUBJECT_LOCATIONS: readonly SubjectLocation[] = ["held", "ground", "placed", "inside"];

/** Something an `appliesTo` rule is checked against. */
export type RuleSubject =
  | {
      kind: "entity";
      definitionId: string;
      components: ResolvedComponents;
      location: SubjectLocation;
    }
  /** The agent doing the verb. */
  | { kind: "user"; components: ResolvedComponents }
  | { kind: "dead_agent"; components: ResolvedComponents }
  /** Any other living agent: rules must never match one. */
  | { kind: "living_agent" };

export function matchesRule(rule: AppliesToRule, subject: RuleSubject): boolean {
  if ("anyOf" in rule) return rule.anyOf.some((part) => matchesRule(part, subject));
  if ("allOf" in rule) return rule.allOf.every((part) => matchesRule(part, subject));
  if ("not" in rule) return !matchesRule(rule.not, subject);
  if ("isUser" in rule) return subject.kind === "user";
  if ("isDeadAgent" in rule) return subject.kind === "dead_agent";
  if (subject.kind === "living_agent") return false;
  if ("component" in rule) return Object.hasOwn(subject.components, rule.component);
  if (subject.kind !== "entity") return false;
  if ("definition" in rule) return subject.definitionId === rule.definition;
  return subject.location === rule.location;
}

/**
 * Components every match of the rule is sure to have, so a verb may read them: a `component`
 * term, a definition's own components, the union over `allOf` and the intersection over `anyOf`.
 */
export function listGuaranteedComponents(
  rule: AppliesToRule,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
): Set<string> {
  if ("component" in rule) return new Set([rule.component]);
  if ("definition" in rule) {
    return new Set(Object.keys(definitionsById.get(rule.definition)?.components ?? {}));
  }
  if ("allOf" in rule) {
    return new Set(
      rule.allOf.flatMap((part) => [...listGuaranteedComponents(part, definitionsById)]),
    );
  }
  if ("anyOf" in rule) {
    const [first, ...others] = rule.anyOf.map((part) =>
      listGuaranteedComponents(part, definitionsById),
    );
    if (first === undefined) return new Set();
    return new Set([...first].filter((name) => others.every((set) => set.has(name))));
  }
  return new Set();
}

/** Whether every match is held by the user or is the user: what an aimed verb needs. */
export function requiresHeldOrUser(rule: AppliesToRule): boolean {
  if ("location" in rule) return rule.location === "held";
  if ("isUser" in rule) return true;
  if ("allOf" in rule) return rule.allOf.some(requiresHeldOrUser);
  if ("anyOf" in rule) return rule.anyOf.length > 0 && rule.anyOf.every(requiresHeldOrUser);
  return false;
}

/** Whether something with these components lies loose on a tile, by the world settings. */
export function isLyingWhenOnTile(
  file: ItemFile,
  definitionId: string,
  components: ResolvedComponents,
): boolean {
  const matcher = file.world.lyingWhenOnTile;
  return matcher !== undefined && matchesThing(matcher, { definitionId, components });
}

/**
 * The locations an untouched entity of the definition is expected in: something that lies loose
 * can be held, on the ground or inside something; anything else stands where it was placed.
 */
export function listPossibleLocations(
  file: ItemFile,
  definition: ItemDefinition,
): SubjectLocation[] {
  const components = resolveComponents(file.components, definition, {});
  return isLyingWhenOnTile(file, definition.id, components)
    ? ["held", "ground", "inside"]
    : ["placed"];
}

/** The definition as a rule meets it, in each place it can be. */
export function listDefinitionSubjects(file: ItemFile, definition: ItemDefinition): RuleSubject[] {
  const components = resolveComponents(file.components, definition, {});
  return listPossibleLocations(file, definition).map((location) => ({
    kind: "entity",
    definitionId: definition.id,
    components,
    location,
  }));
}

/** The agent body's components before any change; none when the file names no such definition. */
export function resolveBodyDefaults(file: ItemFile): ResolvedComponents {
  const body = file.definitions.find((definition) => definition.id === file.world.agentBody);
  return body ? resolveComponents(file.components, body, {}) : {};
}

/**
 * Every kind of thing a rule could meet: each definition in each place it can be, the user, a dead
 * agent and another living agent. The agent body is never an entity.
 */
export function listAllRuleSubjects(file: ItemFile): RuleSubject[] {
  const body = resolveBodyDefaults(file);
  return [
    ...file.definitions
      .filter((definition) => definition.id !== file.world.agentBody)
      .flatMap((definition) => listDefinitionSubjects(file, definition)),
    { kind: "user", components: body },
    { kind: "dead_agent", components: body },
    { kind: "living_agent" },
  ];
}

function listAllEffects(file: ItemFile): Effect[] {
  return [
    ...file.verbs.flatMap((verb) => verb.effects),
    ...file.definitions.flatMap((definition) => definition.onBroken ?? []),
    ...file.conditions.flatMap((condition) => [...condition.everyMinute, ...condition.onEnd]),
    ...file.reactions.flatMap((reaction) => reaction.effects),
  ];
}

/** Components an effect can add while the sim runs (a door's `closed`, `burning`). */
export function listAddableComponents(file: ItemFile): string[] {
  return [
    ...new Set(
      listAllEffects(file).flatMap((effect) =>
        effect.type === "add_condition" ? [effect.condition] : [],
      ),
    ),
  ];
}

/**
 * The subjects again, each also with every component effects can add: what a rule could meet
 * once the sim has run a while (a door that was closed).
 */
export function listSubjectsWithAddedComponents(
  file: ItemFile,
  subjects: readonly RuleSubject[],
): RuleSubject[] {
  const addable = Object.fromEntries(listAddableComponents(file).map((name) => [name, {}]));
  const added = resolveComponents(file.components, { components: addable }, {});
  return subjects.map((subject) =>
    subject.kind === "living_agent"
      ? subject
      : { ...subject, components: { ...added, ...subject.components } },
  );
}

/** "knife (held)", "the user", "a dead agent": for validation messages and the editor. */
export function describeRuleSubject(subject: RuleSubject): string {
  if (subject.kind === "entity") return `${subject.definitionId} (${subject.location})`;
  if (subject.kind === "user") return "the user";
  if (subject.kind === "dead_agent") return "a dead agent";
  return "another living agent";
}
