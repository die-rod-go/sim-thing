import {
  resolveBodyComponents,
  resolveEntityComponents,
  type Agent,
  type Entity,
  type ResolvedComponents,
  type ThingCatalog,
} from "@village/shared";

/** A component others can see on a thing, for an overlay or the hover card. */
export interface VisibleComponent {
  name: string;
  /** How it reads ("on fire"). */
  words: string;
}

/** The components with words that others can see, in declaration order. */
export function listVisibleComponents(
  catalog: ThingCatalog,
  components: ResolvedComponents,
): VisibleComponent[] {
  return Object.entries(catalog.declarations).flatMap(([name, declaration]) =>
    Object.hasOwn(components, name) && declaration.isVisible && declaration.words !== undefined
      ? [{ name, words: declaration.words }]
      : [],
  );
}

/** What others see on an agent: the visible components of its body. */
export function listVisibleBodyComponents(catalog: ThingCatalog, agent: Agent): VisibleComponent[] {
  return listVisibleComponents(catalog, resolveBodyComponents(catalog, agent));
}

/** One overlay to draw over a map tile: a visible component on a thing standing there. */
export interface TileConditionOverlay {
  key: string;
  conditionName: string;
  tileX: number;
  tileY: number;
}

/** Overlays for every entity on a tile with a visible component (the door on fire). */
export function listTileConditionOverlays(
  entities: readonly Entity[],
  catalog: ThingCatalog,
): TileConditionOverlay[] {
  return entities.flatMap((entity) => {
    if (entity.location.kind !== "tile") return [];
    const { pos } = entity.location;
    return listVisibleComponents(catalog, resolveEntityComponents(catalog, entity)).map(
      (component) => ({
        key: `${entity.id}:${component.name}`,
        conditionName: component.name,
        tileX: pos.x,
        tileY: pos.y,
      }),
    );
  });
}
