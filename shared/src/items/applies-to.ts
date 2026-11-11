import { resolveComponents, type ResolvedComponents } from "./components";
import type { Effect } from "./effect-schema";
import type { ItemDefinition, ItemFile, Verb } from "./item-file";
import type { ThingWhere } from "./matcher-schema";
import { matchesThing, type ThingView } from "./matchers";

/*
 * How a verb's `appliesTo` meets things. Transitional until verbs get their roles: an entity is
 * met where it is (`held`, `here`, `inside`), a dead agent's body `here`; a verb without
 * `appliesTo` is done bare-handed, and another living agent is never used.
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

/**
 * Where an untouched entity of the definition can be met: something that lies loose can be held,
 * here or inside something; anything else stands here, where it was placed.
 */
export function listPossibleWheres(file: ItemFile, definition: ItemDefinition): ThingWhere[] {
  const components = resolveComponents(file.components, definition, {});
  return isLyingWhenOnTile(file, definition.id, components) ? ["held", "here", "inside"] : ["here"];
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

/**
 * Every kind of thing a verb's `appliesTo` could meet: each definition but the agent body in each
 * place it can be, and a dead agent's body here.
 */
export function listAllVerbViews(file: ItemFile): ThingView[] {
  return [
    ...file.definitions
      .filter((definition) => definition.id !== file.world.agentBody)
      .flatMap((definition) => listDefinitionViews(file, definition)),
    { definitionId: file.world.agentBody, components: resolveBodyDefaults(file), where: "here" },
  ];
}

/** Every effect in the file: the verbs' and the rules'. */
export function listAllEffects(file: ItemFile): Effect[] {
  return [
    ...file.verbs.flatMap((verb) => verb.effects),
    ...file.rules.flatMap((rule) => rule.effects),
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
 * The views again, each also with every component effects can add: what a matcher could meet
 * once the sim has run a while (a door that was closed).
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
