import {
  describeCount,
  listComponentWords,
  parseComponentPath,
  resolveEntityComponents,
  type Agent,
  type Entity,
  type ItemDefinition,
  type Position,
  type ResolvedComponents,
  type ThingCatalog,
} from "@village/shared";
import { formatPercent } from "../format/formatters";
import { isLyingOnTile } from "./entity-glyphs";
import { listTileTerrains, type TiledMap, type TiledPlace } from "./tiled-map";

const HEALTH_MAX_FIELD = "max";
const NOTE_COMPONENT = "writing";
const NOTE_TEXT_FIELD = "text";
const NOTE_AUTHOR_FIELD = "author";

/** A note pinned to a board: a written entity inside it. */
export interface InspectedNote {
  author: string;
  text: string;
}

/** One thing on the inspected tile, or several identical loose items counted together. */
export interface InspectedThing {
  key: string;
  /** "bakery door", "a knife", "3 bread". */
  name: string;
  /** Its state in short phrases: "health 80%", "closed", "7 left". */
  details: string[];
  /** What a container holds, counted by definition. */
  contents: string[];
  /** Written things inside it, newest first; empty when it holds none. */
  notes: InspectedNote[];
}

/** Everything the viewer can learn about one map tile. */
export interface TileInspection {
  position: Position;
  placeName: string | null;
  /** Terrain names, top layer first ("wall", "stone floor"). */
  terrains: string[];
  agentNames: string[];
  things: InspectedThing[];
}

export interface TileInspectionSources {
  map: TiledMap;
  agents: readonly Agent[];
  entities: readonly Entity[];
  catalog: ThingCatalog;
}

function isSameTile(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y;
}

/** The smallest named place covering the tile, so a bakery inside the village wins. */
export function findPlaceAt(
  places: readonly TiledPlace[],
  position: Position,
  tileSize: number,
): TiledPlace | null {
  const centerX = (position.x + 0.5) * tileSize;
  const centerY = (position.y + 0.5) * tileSize;
  const covering = places.filter(
    (place) =>
      centerX >= place.x &&
      centerX < place.x + place.width &&
      centerY >= place.y &&
      centerY < place.y + place.height,
  );
  covering.sort((first, second) => first.width * first.height - second.width * second.height);
  return covering[0] ?? null;
}

function describeHealthField(catalog: ThingCatalog, components: ResolvedComponents): string | null {
  const path = parseComponentPath(catalog.world.agentHealth);
  if (path === null) return null;
  const current = components[path.component]?.[path.field];
  const max = components[path.component]?.[HEALTH_MAX_FIELD];
  if (typeof current !== "number") return null;
  const shown = typeof max === "number" && max > 0 ? formatPercent(current / max) : String(current);
  return `${path.component} ${shown}`;
}

function describeEntityState(entity: Entity, catalog: ThingCatalog): string[] {
  const components = resolveEntityComponents(catalog, entity);
  return [
    describeHealthField(catalog, components),
    ...listComponentWords(catalog.declarations, components, false),
  ].filter((detail) => detail !== null);
}

function readNote(entity: Entity, catalog: ThingCatalog): InspectedNote | null {
  const writing = resolveEntityComponents(catalog, entity)[NOTE_COMPONENT];
  const text = writing?.[NOTE_TEXT_FIELD];
  const author = writing?.[NOTE_AUTHOR_FIELD];
  if (typeof text !== "string") return null;
  return { author: typeof author === "string" ? author : "", text };
}

function listHeldBy(holderId: string, entities: readonly Entity[]): Entity[] {
  return entities.filter(
    (entity) => entity.location.kind === "inside" && entity.location.holderId === holderId,
  );
}

function countContents(contents: readonly Entity[], catalog: ThingCatalog): string[] {
  const counts = new Map<string, number>();
  for (const entity of contents) {
    counts.set(entity.definitionId, (counts.get(entity.definitionId) ?? 0) + 1);
  }
  return [...counts].map(([definitionId, count]) => {
    const definition = catalog.definitionsById.get(definitionId);
    return definition ? describeCount(definition, count) : `${count} ${definitionId}`;
  });
}

function inspectEntity(
  entity: Entity,
  definition: ItemDefinition,
  isLying: boolean,
  sources: TileInspectionSources,
): InspectedThing {
  const { catalog } = sources;
  const held = listHeldBy(entity.id, sources.entities);
  const notes = held.flatMap((content) => readNote(content, catalog) ?? []).reverse();
  const otherContents = held.filter((content) => readNote(content, catalog) === null);
  return {
    key: entity.id,
    name: entity.label ?? (isLying ? describeCount(definition, 1) : definition.name),
    details: describeEntityState(entity, catalog),
    contents: countContents(otherContents, catalog),
    notes,
  };
}

/**
 * Placed objects one by one, then loose items: a single item with its state, several of one kind
 * counted together ("3 bread"), since a pile is read by how much is there.
 */
function inspectThings(position: Position, sources: TileInspectionSources): InspectedThing[] {
  const { catalog } = sources;
  const onTile = sources.entities.flatMap((entity) => {
    const definition = catalog.definitionsById.get(entity.definitionId);
    if (entity.location.kind !== "tile" || !isSameTile(entity.location.pos, position)) return [];
    return definition ? [{ entity, definition, isLying: isLyingOnTile(catalog, entity) }] : [];
  });
  const placed = onTile.filter((entry) => !entry.isLying);
  const looseByDefinition = new Map<string, typeof onTile>();
  for (const entry of onTile.filter((candidate) => candidate.isLying)) {
    const pile = looseByDefinition.get(entry.definition.id) ?? [];
    looseByDefinition.set(entry.definition.id, [...pile, entry]);
  }
  const loose = [...looseByDefinition.values()].map((pile) => {
    const [first] = pile;
    if (!first) throw new Error("A pile of loose items was grouped with no items in it");
    if (pile.length === 1) return inspectEntity(first.entity, first.definition, true, sources);
    return {
      key: `pile:${first.definition.id}`,
      name: describeCount(first.definition, pile.length),
      details: [],
      contents: [],
      notes: [],
    };
  });
  return [
    ...placed.map(({ entity, definition }) => inspectEntity(entity, definition, false, sources)),
    ...loose,
  ];
}

/** Gathers what is at a tile from the client's copy of the world; reads, never changes, state. */
export function inspectTile(position: Position, sources: TileInspectionSources): TileInspection {
  const { map } = sources;
  return {
    position,
    placeName: findPlaceAt(map.places, position, map.tileWidth)?.name ?? null,
    terrains: listTileTerrains(map, position).map((terrain) => terrain.replaceAll("_", " ")),
    agentNames: sources.agents
      .filter((agent) => isSameTile(agent.pos, position))
      .map((agent) => (agent.death === null ? agent.name : `${agent.name} (dead)`)),
    things: inspectThings(position, sources),
  };
}
