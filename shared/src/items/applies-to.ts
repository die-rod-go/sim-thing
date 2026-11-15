import { resolveComponents, type ResolvedComponents } from "./components";
import type { ItemDefinition, ItemFile, Verb } from "./item-file";
import type { Step } from "./step-schema";
import type { ThingWhere } from "./matcher-schema";
import { matchesThing, type ThingView } from "./matchers";

/*
 * How a verb's `appliesTo` meets things. The verb's item is always an entity, met where it is
 * (`held`, `here`, `inside`), or `self` for a creature using its own body; an agent's body is never
 * an item. A verb without `appliesTo` is done bare-handed.
 */

/** Whether the verb applies to the thing as the user meets it. Bare-handed verbs apply to nothing. */
export function matchesAppliesTo(verb: Verb, view: ThingView): boolean {
  return verb.appliesTo !== undefined && matchesThing(verb.appliesTo, view);
}

export function isBareHanded(verb: Verb): boolean {
  return verb.appliesTo === undefined;
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

/** Whether an instinct applies to the definition untouched, so it acts as a creature. */
export function isCreatureDefinition(file: ItemFile, definition: ItemDefinition): boolean {
  const components = resolveComponents(file.components, definition, {});
  const view: ThingView = { definitionId: definition.id, components, where: "self" };
  return file.instincts.some((instinct) => matchesThing(instinct.appliesTo, view));
}

/**
 * Where an untouched entity of the definition can be met: something that lies loose can be held,
 * here or inside something; anything else stands here, where it was placed. A creature also meets
 * itself, as the item of the verbs its instincts do.
 */
export function listPossibleWheres(file: ItemFile, definition: ItemDefinition): ThingWhere[] {
  const components = resolveComponents(file.components, definition, {});
  const wheres: ThingWhere[] = isLyingWhenOnTile(file, definition.id, components)
    ? ["held", "here", "inside"]
    : ["here"];
  return isCreatureDefinition(file, definition) ? [...wheres, "self"] : wheres;
}

/** The definition as a verb's `appliesTo` meets it, in each place it can be. */
export function listDefinitionViews(file: ItemFile, definition: ItemDefinition): ThingView[] {
  const components = resolveComponents(file.components, definition, {});
  return listPossibleWheres(file, definition).map((where) => ({
    definitionId: definition.id,
    components,
    where,
  }));
}

/** The agent body's components before any change; none when the file names no such definition. */
export function resolveBodyDefaults(file: ItemFile): ResolvedComponents {
  const body = file.definitions.find((definition) => definition.id === file.world.agentBody);
  return body ? resolveComponents(file.components, body, {}) : {};
}

/** Every kind of thing a verb's `appliesTo` could meet: each definition but the agent body, in each place it can be. */
export function listAllVerbViews(file: ItemFile): ThingView[] {
  return file.definitions
    .filter((definition) => definition.id !== file.world.agentBody)
    .flatMap((definition) => listDefinitionViews(file, definition));
}

/** Every step in the file: the verbs' and the rules'. */
export function listAllSteps(file: ItemFile): Step[] {
  return [...file.verbs.flatMap((verb) => verb.steps), ...file.rules.flatMap((rule) => rule.steps)];
}

/** Components a step can add while the sim runs (a condition). */
export function listAddableComponents(file: ItemFile): string[] {
  return [
    ...new Set(listAllSteps(file).flatMap((step) => (step.step === "add" ? [step.component] : []))),
  ];
}

/** Components a step can remove while the sim runs. */
export function listRemovableComponents(file: ItemFile): string[] {
  return [
    ...new Set(
      listAllSteps(file).flatMap((step) => (step.step === "remove" ? [step.component] : [])),
    ),
  ];
}

/**
 * The views again, each also with every component steps can add: what a matcher could meet
 * once the sim has run a while (something that has been changed).
 */
export function listViewsWithAddedComponents(
  file: ItemFile,
  views: readonly ThingView[],
): ThingView[] {
  const addable = Object.fromEntries(listAddableComponents(file).map((name) => [name, {}]));
  const added = resolveComponents(file.components, { components: addable }, {});
  return views.map((view) => ({ ...view, components: { ...added, ...view.components } }));
}

/** "knife (held)", "person (here)": for validation messages and the editor. */
export function describeThingView(view: ThingView): string {
  return view.where === undefined ? view.definitionId : `${view.definitionId} (${view.where})`;
}
