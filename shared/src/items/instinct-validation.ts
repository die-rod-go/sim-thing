import { isBareHanded, isCreatureDefinition } from "./applies-to";
import { parseComponentPath } from "./component-schema";
import { resolveComponents } from "./components";
import type { Instinct, InstinctOfKind, ItemDefinition, Verb } from "./item-file";
import type { ValidationContext } from "./item-problems";
import { checkMatcher, couldMatchAnyView, listViewsAfterSteps } from "./matcher-validation";
import { listComparisonReads, listGuaranteedComponents, requiresWhere } from "./matchers";

import { AGENT_ONLY_STEPS } from "./step-schema";
import { parseValuePath, type NumberValue } from "./value-schema";

/** One instinct being checked, with what its `appliesTo` guarantees the creature has. */
interface InstinctCheck {
  context: ValidationContext;
  path: string;
  guaranteed: ReadonlySet<string>;
}

function describeInstinctPath(instinct: Instinct, index: number): string {
  const what = instinct.do === "verb" ? `verb ${instinct.verb}` : instinct.do;
  return `instincts.${index} (${what})`;
}

/** A value an instinct reads must be a number field of a component its `appliesTo` requires. */
function checkSelfRead(valuePath: string, where: string, check: InstinctCheck) {
  const { problems, file } = check.context;
  const parsed = parseValuePath(valuePath);
  if (parsed?.kind !== "field" || parsed.who !== "self") {
    problems.error(where, `"${valuePath}" must read the creature itself: self.component.field.`);
    return;
  }
  const { component, field } = parsed;
  if (!check.guaranteed.has(component)) {
    problems.error(
      where,
      `Reads ${valuePath}, but appliesTo doesn't require the ${component} component.`,
    );
    return;
  }
  const type = file.components[component]?.fields[field]?.type;
  if (type !== "number" && type !== "range") {
    problems.error(where, `${component}.${field} must be a number field.`);
  }
}

function checkNumber(value: NumberValue, setting: string, check: InstinctCheck) {
  if (typeof value === "number") return;
  const where = `${check.path}.${setting}`;
  if ("from" in value) checkSelfRead(value.from, where, check);
  if (typeof value.times === "string") checkSelfRead(value.times, where, check);
}

/** The verbs of that name a creature could do: with its own body, or bare-handed. */
function listCreatureVerbs(verbs: readonly Verb[], name: string): Verb[] {
  const wanted = name.trim().toLowerCase();
  return verbs.filter(
    (verb) =>
      verb.name.trim().toLowerCase() === wanted &&
      (isBareHanded(verb) ||
        (verb.appliesTo !== undefined && requiresWhere(verb.appliesTo, "self"))),
  );
}

function checkVerbInstinct(instinct: InstinctOfKind<"verb">, check: InstinctCheck) {
  const { context, path } = check;
  const { problems, file } = context;
  const verbs = listCreatureVerbs(file.verbs, instinct.verb);
  if (verbs.length === 0) {
    problems.error(
      `${path}.verb`,
      `There is no verb "${instinct.verb}" a creature can do: one whose appliesTo requires \`where: self\`, or a bare-handed one.`,
    );
  }
  for (const verb of verbs) {
    const agentOnly = verb.steps.find((step) => AGENT_ONLY_STEPS.has(step.step));
    if (agentOnly !== undefined) {
      problems.error(`${path}.verb`, `Only an agent can do a verb with a ${agentOnly.step} step.`);
    }
  }
  if (instinct.target !== undefined) {
    checkMatcher(instinct.target, `${path}.target`, context, { isTarget: true });
  }
  checkNumber(instinct.range, "range", check);
  checkSourceOf(instinct, verbs, check);
}

function checkSourceOf(
  instinct: InstinctOfKind<"verb">,
  verbs: readonly Verb[],
  check: InstinctCheck,
) {
  const { problems, file } = check.context;
  if (instinct.sourceOf === undefined) return;
  const where = `${check.path}.sourceOf`;
  if (!Object.hasOwn(file.components, instinct.sourceOf)) {
    problems.error(where, `Unknown component "${instinct.sourceOf}".`);
  }
  if (verbs.length > 0 && verbs.every((verb) => verb.target === undefined)) {
    problems.error(where, "Going for a component's source needs a verb with a target.");
  }
}

/** Warns when no definition, as the sim could leave it, is something this instinct applies to. */
function checkAppliesToSomething(instinct: Instinct, check: InstinctCheck) {
  const { file, problems } = check.context;
  const views = file.definitions
    .filter((definition) => definition.id !== file.world.agentBody)
    .map((definition) => ({
      definitionId: definition.id,
      components: resolveComponents(file.components, definition, {}),
      where: "self" as const,
    }));
  if (!couldMatchAnyView(instinct.appliesTo, listViewsAfterSteps(file, views))) {
    problems.warning(`${check.path}.appliesTo`, "appliesTo matches nothing.");
  }
}

const CREATURE_STAT_SETTINGS = ["creatureStrength", "creatureAgility"] as const;

/** Every creature has its own strength and agility: the fields the world settings name. */
function checkCreatureStats(creatures: readonly ItemDefinition[], context: ValidationContext) {
  const { file, problems } = context;
  if (creatures.length === 0) return;
  for (const setting of CREATURE_STAT_SETTINGS) {
    const componentPath = file.world[setting];
    if (componentPath === undefined) {
      problems.error(
        `world.${setting}`,
        "With creatures in the file, this must name a number field.",
      );
      continue;
    }
    const component = parseComponentPath(componentPath)?.component;
    for (const creature of creatures) {
      if (component === undefined || Object.hasOwn(creature.components, component)) continue;
      const index = file.definitions.indexOf(creature);
      problems.error(
        `definitions.${index} (${creature.id})`,
        `A creature needs the ${component} component (world.${setting}).`,
      );
    }
  }
}

/** The instincts: their matchers, the values they read and the verbs they name; and creatures' stats. */
export function checkInstincts(context: ValidationContext): void {
  const { file } = context;
  const definitionsById = new Map(
    file.definitions.map((definition) => [definition.id, definition]),
  );
  file.instincts.forEach((instinct, index) => {
    const path = describeInstinctPath(instinct, index);
    const guaranteed = listGuaranteedComponents(instinct.appliesTo, definitionsById);
    const check: InstinctCheck = { context, path, guaranteed };
    checkMatcher(instinct.appliesTo, `${path}.appliesTo`, context, {
      isAppliesTo: true,
      canReadValues: true,
    });
    for (const read of listComparisonReads(instinct.appliesTo)) {
      checkSelfRead(read.from, `${path}.appliesTo`, check);
    }
    checkAppliesToSomething(instinct, check);
    if (instinct.do === "verb") checkVerbInstinct(instinct, check);
    if (instinct.do === "flee") {
      checkMatcher(instinct.from, `${path}.from`, context);
      checkNumber(instinct.radius, "radius", check);
    }
    if (instinct.do === "wander") checkNumber(instinct.chance, "chance", check);
  });
  const creatures = file.definitions.filter((definition) => isCreatureDefinition(file, definition));
  checkCreatureStats(creatures, context);
}
