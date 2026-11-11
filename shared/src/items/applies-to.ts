import type { AppliesToRule, ItemDefinition, ItemForm } from "./item-file";

/** Where an entity is relative to the agent who would use it. `inside` matches no location term. */
export type SubjectLocation = "held" | "ground" | "placed" | "inside";

/** Something an `appliesTo` rule is checked against. */
export type RuleSubject =
  | { kind: "entity"; definition: ItemDefinition; location: SubjectLocation }
  /** The agent doing the verb. */
  | { kind: "user"; properties: readonly string[] }
  | { kind: "dead_agent"; properties: readonly string[] }
  /** Any other living agent: rules must never match one. */
  | { kind: "living_agent"; properties: readonly string[] };

function hasProperty(subject: RuleSubject, property: string): boolean {
  if (subject.kind === "entity") return subject.definition.properties.includes(property);
  if (subject.kind === "living_agent") return false;
  return subject.properties.includes(property);
}

export function matchesRule(rule: AppliesToRule, subject: RuleSubject): boolean {
  if ("anyOf" in rule) return rule.anyOf.some((part) => matchesRule(part, subject));
  if ("allOf" in rule) return rule.allOf.every((part) => matchesRule(part, subject));
  if ("not" in rule) return !matchesRule(rule.not, subject);
  if ("isUser" in rule) return subject.kind === "user";
  if ("isDeadAgent" in rule) return subject.kind === "dead_agent";
  if ("property" in rule) return hasProperty(subject, rule.property);
  if (subject.kind !== "entity") return false;
  if ("definition" in rule) return subject.definition.id === rule.definition;
  if ("component" in rule) return Object.hasOwn(subject.definition.components, rule.component);
  if ("form" in rule) return subject.definition.form === rule.form;
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

/** The locations an entity of this form can be in. */
export function listPossibleLocations(form: ItemForm): SubjectLocation[] {
  return form === "placeable" ? ["placed"] : ["held", "ground", "inside"];
}

/**
 * Every kind of thing a rule could meet: each definition in each place it can be, the user, a dead
 * agent and another living agent (both with the `person` properties).
 */
export function listAllRuleSubjects(
  definitions: readonly ItemDefinition[],
  personProperties: readonly string[],
): RuleSubject[] {
  return [
    ...definitions.flatMap((definition) =>
      listPossibleLocations(definition.form).map((location): RuleSubject => ({
        kind: "entity",
        definition,
        location,
      })),
    ),
    { kind: "user", properties: personProperties },
    { kind: "dead_agent", properties: personProperties },
    { kind: "living_agent", properties: personProperties },
  ];
}

/** "knife (held)", "the user", "a dead agent": for validation messages and the editor. */
export function describeRuleSubject(subject: RuleSubject): string {
  if (subject.kind === "entity") return `${subject.definition.id} (${subject.location})`;
  if (subject.kind === "user") return "the user";
  if (subject.kind === "dead_agent") return "a dead agent";
  return "another living agent";
}
