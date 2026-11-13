import type { Agent } from "../types";
import { parseComponentPath, type ComponentDeclarations } from "./component-schema";
import { resolveComponents, type ComponentChanges, type ResolvedComponents } from "./components";
import type { Entity } from "./entity";
import type { ItemDefinition, ItemFile, Verb, WorldSettings } from "./item-file";
import { buildRuleIndex, type RuleIndex } from "./rule-index";

/**
 * What resolving a thing's components needs: the declarations, the world settings and the
 * definitions. The client builds one from the snapshot; the server's `ItemCatalog` is one.
 */
export interface ThingCatalog {
  declarations: ComponentDeclarations;
  world: WorldSettings;
  definitionsById: ReadonlyMap<string, ItemDefinition>;
  /** Each definition's components with no changes applied: what an untouched thing has. */
  definitionComponentsById: ReadonlyMap<string, ResolvedComponents>;
}

/** A parsed `items.json` with lookups by id and name. */
export interface ItemCatalog extends ThingCatalog {
  file: ItemFile;
  rules: RuleIndex;
  verbs: readonly Verb[];
}

const NO_CHANGES: ComponentChanges = {};

export function buildThingCatalog(
  declarations: ComponentDeclarations,
  world: WorldSettings,
  definitions: readonly ItemDefinition[],
): ThingCatalog {
  return {
    declarations,
    world,
    definitionsById: new Map(definitions.map((definition) => [definition.id, definition])),
    definitionComponentsById: new Map(
      definitions.map((definition) => [
        definition.id,
        resolveComponents(declarations, definition, NO_CHANGES),
      ]),
    ),
  };
}

export function buildItemCatalog(file: ItemFile): ItemCatalog {
  return {
    ...buildThingCatalog(file.components, file.world, file.definitions),
    file,
    rules: buildRuleIndex(file.rules),
    verbs: file.verbs,
  };
}

export function findDefinition(catalog: ThingCatalog, definitionId: string): ItemDefinition {
  const definition = catalog.definitionsById.get(definitionId);
  if (!definition) throw new Error(`No item definition "${definitionId}" in items.json`);
  return definition;
}

/** The components of something of that definition, given how it differs from it. */
export function resolveThingComponents(
  catalog: ThingCatalog,
  definitionId: string,
  changes: ComponentChanges,
): ResolvedComponents {
  const untouched = catalog.definitionComponentsById.get(definitionId);
  if (untouched !== undefined && Object.keys(changes).length === 0) return untouched;
  return resolveComponents(catalog.declarations, findDefinition(catalog, definitionId), changes);
}

export function resolveEntityComponents(catalog: ThingCatalog, entity: Entity): ResolvedComponents {
  return resolveThingComponents(catalog, entity.definitionId, entity.changes);
}

/** Whether the agent's body is still in the world: not transformed into something else (buried). */
export function isBodyInWorld(agent: Pick<Agent, "bodyReplacedById">): boolean {
  return agent.bodyReplacedById === null;
}

/** The components of an agent's body: the `agentBody` definition with the agent's changes. */
export function resolveBodyComponents(
  catalog: ThingCatalog,
  agent: Pick<Agent, "bodyChanges">,
): ResolvedComponents {
  return resolveThingComponents(catalog, catalog.world.agentBody, agent.bodyChanges);
}

/** The agent's health: the body field the world setting `agentHealth` names. */
export function readAgentHealth(catalog: ThingCatalog, agent: Pick<Agent, "bodyChanges">): number {
  const path = parseComponentPath(catalog.world.agentHealth);
  const health =
    path === null ? undefined : resolveBodyComponents(catalog, agent)[path.component]?.[path.field];
  if (typeof health !== "number") {
    throw new Error(`The agent body has no number field "${catalog.world.agentHealth}"`);
  }
  return health;
}

function startsWithVowelSound(text: string): boolean {
  return /^[aeiou]/i.test(text);
}

/** "a knife", "3 knives", "30 coins"; things without a plural count as "1 bread", "3 bread". */
export function describeCount(definition: ItemDefinition, count: number): string {
  if (definition.plural === undefined) return `${count} ${definition.name}`;
  if (count === 1) {
    return `${startsWithVowelSound(definition.name) ? "an" : "a"} ${definition.name}`;
  }
  return `${count} ${definition.plural}`;
}

/** The names a reply may use for a definition: its name and its plural. */
export function listDefinitionNames(definition: ItemDefinition): string[] {
  return definition.plural === undefined ? [definition.name] : [definition.name, definition.plural];
}

/** The definition a reply names, by id, name or plural, ignoring case. */
export function findDefinitionByName(
  catalog: ItemCatalog,
  name: string,
): ItemDefinition | undefined {
  const wanted = name.trim().toLowerCase();
  return catalog.file.definitions.find(
    (definition) =>
      definition.id === wanted ||
      listDefinitionNames(definition).some((candidate) => candidate.toLowerCase() === wanted),
  );
}
