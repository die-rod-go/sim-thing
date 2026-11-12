import {
  describeCount,
  isDirectlyInside,
  resolveEntityComponents,
  type Entity,
  type FieldDeclaration,
  type FieldValue,
  type ResolvedComponents,
  type ThingCatalog,
} from "@village/shared";

const DECIMAL_PLACES = 2;

export interface ItemFieldData {
  fieldName: string;
  value: string;
}

/** One component an item has right now; a tag has no fields. */
export interface ItemComponentData {
  componentName: string;
  fields: ItemFieldData[];
}

/** Carried items that share a definition and every field value, so they read as one entry. */
export interface CarriedItemGroup {
  key: string;
  /** "30 coins", "a note". */
  label: string;
  data: ItemComponentData[];
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(DECIMAL_PLACES)));
}

function formatFieldValue(
  value: FieldValue,
  declaration: FieldDeclaration | undefined,
  catalog: ThingCatalog,
): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") {
    if (declaration?.type !== "item") return value;
    return catalog.definitionsById.get(value)?.name ?? value;
  }
  return `${formatNumber(value.min)}–${formatNumber(value.max)}`;
}

/** Every component a thing has and its field values, for the viewer; empty text is left out. */
export function describeItemData(
  components: ResolvedComponents,
  catalog: ThingCatalog,
): ItemComponentData[] {
  return Object.entries(components).map(([componentName, values]) => {
    const declaredFields = catalog.declarations[componentName]?.fields ?? {};
    const fields = Object.entries(values)
      .filter(([, value]) => value !== "")
      .map(([fieldName, value]) => ({
        fieldName,
        value: formatFieldValue(value, declaredFields[fieldName], catalog),
      }));
    return { componentName, fields };
  });
}

function describeGroupKey(entity: Entity, components: ResolvedComponents): string {
  return JSON.stringify([entity.definitionId, entity.label, components]);
}

/**
 * What the agent carries directly. Identical items are counted together ("30 coins"); an item
 * whose data differs, like a note with its own words, gets an entry of its own.
 */
export function groupCarriedItems(
  agentId: string,
  entities: readonly Entity[],
  catalog: ThingCatalog,
): CarriedItemGroup[] {
  const groups = new Map<
    string,
    { first: Entity; components: ResolvedComponents; count: number }
  >();
  for (const entity of entities) {
    if (!isDirectlyInside(entity, agentId)) continue;
    const components = resolveEntityComponents(catalog, entity);
    const key = describeGroupKey(entity, components);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { first: entity, components, count: 1 });
  }
  return [...groups.values()].map(({ first, components, count }) => {
    const definition = catalog.definitionsById.get(first.definitionId);
    const countedName = definition
      ? describeCount(definition, count)
      : `${count} ${first.definitionId}`;
    return {
      key: first.id,
      label: first.label === null ? countedName : `${countedName} (${first.label})`,
      data: describeItemData(components, catalog),
    };
  });
}
