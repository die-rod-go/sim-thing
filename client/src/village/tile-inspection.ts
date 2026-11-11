import {
  describeCount,
  type Agent,
  type Entity,
  type ItemDefinition,
  type Note,
  type Position,
  type SimTimeSettings,
} from "@village/shared";
import { describeCondition } from "../format/character-sheet";
import { formatPercent } from "../format/formatters";
import { listTileTerrains, type TiledMap, type TiledPlace } from "./tiled-map";

/** One thing on the inspected tile, or several identical loose items counted together. */
export interface InspectedThing {
  key: string;
  /** "bakery door", "a knife", "3 bread". */
  name: string;
  /** Its state in short phrases: "durability 80%", "closed", "used by Ada". */
  details: string[];
  /** What a container holds, counted by definition. */
  contents: string[];
  /** Notes pinned to it, newest first; empty when it holds none. */
  notes: Note[];
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
  definitions: readonly ItemDefinition[];
  currentTick: number;
  timeSettings: SimTimeSettings;
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

function describeStock(entity: Entity, definition: ItemDefinition): string | null {
  const { stock } = entity.state;
  if (stock === undefined) return null;
  const capacity = definition.components.stock?.capacity;
  return typeof capacity === "number" ? `stock ${stock} of ${capacity}` : `stock ${stock}`;
}

function describeEntityState(
  entity: Entity,
  definition: ItemDefinition,
  sources: TileInspectionSources,
): string[] {
  const { state } = entity;
  const agentNames = new Map(sources.agents.map((agent) => [agent.id, agent.name]));
  const users = (state.userIds ?? []).map((userId) => agentNames.get(userId) ?? userId);
  const details = [
    state.durability === undefined ? null : `durability ${formatPercent(state.durability)}`,
    describeStock(entity, definition),
    state.isOpen === undefined ? null : state.isOpen ? "open" : "closed",
    users.length > 0 ? `used by ${users.join(", ")}` : null,
    ...state.conditions.map((condition) =>
      describeCondition(condition, sources.currentTick, sources.timeSettings),
    ),
  ];
  return details.filter((detail) => detail !== null);
}

function countContents(
  containerId: string,
  entities: readonly Entity[],
  definitionsById: ReadonlyMap<string, ItemDefinition>,
): string[] {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    if (entity.location.kind !== "inside" || entity.location.containerId !== containerId) continue;
    counts.set(entity.definitionId, (counts.get(entity.definitionId) ?? 0) + 1);
  }
  return [...counts].map(([definitionId, count]) => {
    const definition = definitionsById.get(definitionId);
    return definition ? describeCount(definition, count) : `${count} ${definitionId}`;
  });
}

function inspectEntity(
  entity: Entity,
  definition: ItemDefinition,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  sources: TileInspectionSources,
): InspectedThing {
  const isPlaced = definition.form === "placeable";
  return {
    key: entity.id,
    name: entity.label ?? (isPlaced ? definition.name : describeCount(definition, 1)),
    details: describeEntityState(entity, definition, sources),
    contents: countContents(entity.id, sources.entities, definitionsById),
    notes: [...(entity.state.notes ?? [])].sort((first, second) => second.tick - first.tick),
  };
}

/**
 * Placed objects one by one, then loose items: a single item with its state, several of one kind
 * counted together ("3 bread"), since a pile is read by how much is there.
 */
function inspectThings(position: Position, sources: TileInspectionSources): InspectedThing[] {
  const definitionsById = new Map(
    sources.definitions.map((definition) => [definition.id, definition]),
  );
  const onTile = sources.entities.flatMap((entity) => {
    const definition = definitionsById.get(entity.definitionId);
    if (entity.location.kind !== "tile" || !isSameTile(entity.location.pos, position)) return [];
    return definition ? [{ entity, definition }] : [];
  });
  const placed = onTile.filter((entry) => entry.definition.form === "placeable");
  const looseByDefinition = new Map<string, typeof onTile>();
  for (const entry of onTile.filter((candidate) => candidate.definition.form !== "placeable")) {
    const pile = looseByDefinition.get(entry.definition.id) ?? [];
    looseByDefinition.set(entry.definition.id, [...pile, entry]);
  }
  const loose = [...looseByDefinition.values()].map((pile) => {
    const [first] = pile;
    if (!first) throw new Error("A pile of loose items was grouped with no items in it");
    if (pile.length === 1) {
      return inspectEntity(first.entity, first.definition, definitionsById, sources);
    }
    return {
      key: `pile:${first.definition.id}`,
      name: describeCount(first.definition, pile.length),
      details: [],
      contents: [],
      notes: [],
    };
  });
  return [
    ...placed.map(({ entity, definition }) =>
      inspectEntity(entity, definition, definitionsById, sources),
    ),
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
