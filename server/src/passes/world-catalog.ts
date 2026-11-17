import {
  describeCount,
  isBareHanded,
  isCreatureDefinition,
  listViewsWithAddedComponentSets,
  listDefinitionViews,
  matchesAppliesTo,
  couldMatchAnyView,
  parseValuePath,
  type DefinitionValue,
  type ItemCatalog,
  type ItemDefinition,
  type Matcher,
  type NumberValue,
  type Step,
  type ThingView,
  type Verb,
} from "@village/shared";
import { config } from "../config";

/*
 * The world's rules as the reality pass reads them: every definition with the verbs a person can
 * use on it, and what each verb needs, uses up and makes. Built from `items.json` alone, so it says
 * what can exist, never where anything is.
 */

const USER_ROLE = "user";
const ITEM_ROLE = "item";

function fillText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}

/** A field of the thing the verb is used on, read as `item.component.field`; null for other reads. */
function readItemField(path: string, view: ThingView): unknown {
  const parsed = parseValuePath(path);
  if (parsed?.kind !== "field" || parsed.who !== ITEM_ROLE) return null;
  return view.components[parsed.component]?.[parsed.field] ?? null;
}

function resolveCount(value: NumberValue, view: ThingView): number | null {
  if (typeof value === "number") return value;
  if (!("from" in value) || value.times !== undefined) return null;
  const count = readItemField(value.from, view);
  return typeof count === "number" ? count : null;
}

function resolveCreatedDefinitionId(item: DefinitionValue, view: ThingView): string | null {
  if (typeof item === "string") return item;
  const definitionId = readItemField(item.from, view);
  return typeof definitionId === "string" ? definitionId : null;
}

function isAgentBody(catalog: ItemCatalog, definition: ItemDefinition): boolean {
  return definition.id === catalog.world.agentBody;
}

/**
 * Definitions a person could carry that the matcher could accept: what a `require` or `use_up`
 * takes. Field comparisons count as met, since only a run knows their values (the key whose id
 * matches this lock).
 */
function listCarriedMatches(catalog: ItemCatalog, rule: Matcher): ItemDefinition[] {
  return catalog.file.definitions.filter(
    (definition) =>
      !isAgentBody(catalog, definition) &&
      couldMatchAnyView(
        rule,
        listDefinitionViews(catalog.file, definition).filter((view) => view.where === "held"),
      ),
  );
}

function describeAmount(definition: ItemDefinition, count: number | null): string {
  return count === null ? (definition.plural ?? definition.name) : describeCount(definition, count);
}

function describeAlternatives(
  definitions: readonly ItemDefinition[],
  count: number | null,
): string {
  const words = config.worldCatalog;
  return definitions
    .map((definition) => describeAmount(definition, count))
    .join(words.alternativesJoiner);
}

interface VerbUse {
  needs: string[];
  uses: string[];
  makes: string[];
}

function addStepUse(catalog: ItemCatalog, use: VerbUse, step: Step, view: ThingView): void {
  if ((step.step === "require" || step.step === "use_up") && step.in === USER_ROLE) {
    const matches = listCarriedMatches(catalog, step.rule);
    if (matches.length === 0) return;
    (step.step === "require" ? use.needs : use.uses).push(
      describeAlternatives(matches, step.count),
    );
    return;
  }
  if (step.step !== "create") return;
  const definitionId = resolveCreatedDefinitionId(step.item, view);
  const definition = definitionId === null ? undefined : catalog.definitionsById.get(definitionId);
  if (definition === undefined) return;
  use.makes.push(describeAmount(definition, resolveCount(step.count, view)));
}

/** "bake bread (uses 1 wheat, 1 water; makes 2 bread)". */
function describeVerbUse(catalog: ItemCatalog, verb: Verb, view: ThingView): string {
  const words = config.worldCatalog;
  const use: VerbUse = { needs: [], uses: [], makes: [] };
  for (const step of verb.steps) addStepUse(catalog, use, step, view);
  const parts = [
    [words.needsText, use.needs],
    [words.usesText, use.uses],
    [words.makesText, use.makes],
  ] as const;
  const details = parts
    .filter(([, things]) => things.length > 0)
    .map(([template, things]) => fillText(template, { things: things.join(words.listJoiner) }));
  return details.length === 0
    ? verb.name
    : fillText(words.verbWithDetails, { verb: verb.name, details: details.join(words.partJoiner) });
}

interface DefinitionVerb {
  verbName: string;
  description: string;
}

interface CatalogEntry {
  definition: ItemDefinition;
  canBeCarried: boolean;
  verbs: DefinitionVerb[];
}

/**
 * The verbs a person can use on the definition wherever they meet it, also once steps have changed
 * it (a door only offers `open` once closed). A creature's verbs for its own body are left out.
 */
function listDefinitionVerbs(catalog: ItemCatalog, views: readonly ThingView[]): DefinitionVerb[] {
  const verbs = catalog.verbs.flatMap((verb) => {
    const view = views.find((candidate) => matchesAppliesTo(verb, candidate));
    return view === undefined
      ? []
      : [{ verbName: verb.name, description: describeVerbUse(catalog, verb, view) }];
  });
  return verbs.filter(
    (verb, index) => verbs.findIndex((other) => other.description === verb.description) === index,
  );
}

/** The verbs it offers untouched, and once steps have changed it (a closed door offers `open`). */
function buildCatalogEntry(catalog: ItemCatalog, definition: ItemDefinition): CatalogEntry {
  const views = listDefinitionViews(catalog.file, definition).filter(
    (view) => view.where !== "self",
  );
  const changedViews = listViewsWithAddedComponentSets(catalog.file, views);
  return {
    definition,
    canBeCarried: views.some((view) => view.where === "held"),
    verbs: listDefinitionVerbs(catalog, [...views, ...changedViews]),
  };
}

/** Verbs every carriable thing offers (drop, take): said once, not on every line. */
function listCarriedThingVerbs(entries: readonly CatalogEntry[]): string[] {
  const carried = entries.filter((entry) => entry.canBeCarried);
  const [first] = carried;
  if (first === undefined) return [];
  return [...new Set(first.verbs.map((verb) => verb.verbName))].filter((verbName) =>
    carried.every((entry) => entry.verbs.some((verb) => verb.verbName === verbName)),
  );
}

function describeEntry(
  catalog: ItemCatalog,
  entry: CatalogEntry,
  sharedVerbNames: readonly string[],
): string {
  const words = config.worldCatalog;
  const { definition } = entry;
  const name = isCreatureDefinition(catalog.file, definition)
    ? fillText(words.creatureName, { name: definition.name })
    : definition.name;
  const verbs = entry.verbs
    .filter((verb) => !(entry.canBeCarried && sharedVerbNames.includes(verb.verbName)))
    .map((verb) => verb.description);
  return verbs.length === 0
    ? `- ${name}`
    : `- ${fillText(words.thingWithVerbs, { name, verbs: verbs.join(words.verbJoiner) })}`;
}

/** `items.json` is fixed for a run, so each catalog is described once. */
const describedCatalogs = new WeakMap<ItemCatalog, string>();

/** One line per definition a person can meet, then the verbs any carried thing and bare hands offer. */
export function describeWorldCatalog(catalog: ItemCatalog): string {
  const described = describedCatalogs.get(catalog) ?? buildWorldCatalogText(catalog);
  describedCatalogs.set(catalog, described);
  return described;
}

function buildWorldCatalogText(catalog: ItemCatalog): string {
  const words = config.worldCatalog;
  const entries = catalog.file.definitions
    .filter((definition) => !isAgentBody(catalog, definition))
    .map((definition) => buildCatalogEntry(catalog, definition));
  const carriedThingVerbs = listCarriedThingVerbs(entries);
  const bareHandedVerbs = [
    ...new Set(catalog.verbs.filter((verb) => isBareHanded(verb)).map((verb) => verb.name)),
  ];
  const closingLines = [
    [words.carriedThings, carriedThingVerbs],
    [words.bareHanded, bareHandedVerbs],
  ] as const;
  return [
    ...entries.map((entry) => describeEntry(catalog, entry, carriedThingVerbs)),
    ...closingLines
      .filter(([, verbNames]) => verbNames.length > 0)
      .map(([template, verbNames]) =>
        fillText(template, { verbs: verbNames.join(words.verbJoiner) }),
      ),
  ].join("\n");
}
