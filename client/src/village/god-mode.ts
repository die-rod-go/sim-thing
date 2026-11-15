import type { Agent, Entity, GodAction, Position, ThingCatalog } from "@village/shared";
import { listPlacedGlyphs } from "./entity-glyphs";

/** What god mode has in hand: a person or a thing picked up off the map. */
export type HeldThing =
  | { kind: "agent"; agentId: string; name: string }
  | { kind: "entity"; entityId: string; name: string };

/** The god mode tool, and what it is in the middle of. */
export type GodTool =
  | { kind: "grab" }
  | { kind: "holding"; held: HeldThing }
  | { kind: "place"; definitionId: string | null }
  | { kind: "delete" };

/** What was clicked: a map tile, or a person's marker. */
export type GodClickTarget = { kind: "tile"; pos: Position } | { kind: "agent"; agentId: string };

export interface GodWorld {
  agents: readonly Agent[];
  entities: readonly Entity[];
  catalog: ThingCatalog;
}

export interface GodClickOutcome {
  /** The change to ask the server for, or null when the click only changes the tool. */
  action: GodAction | null;
  nextTool: GodTool;
}

/** The entity drawn on top at the tile: the last one painted there. */
export function findTopEntityAt(world: GodWorld, pos: Position): Entity | null {
  const onTile = listPlacedGlyphs(world.entities, world.catalog).filter(
    (placed) => placed.tileX === pos.x && placed.tileY === pos.y,
  );
  const top = onTile.at(-1);
  if (!top) return null;
  return world.entities.find((entity) => entity.id === top.entityId) ?? null;
}

function describeEntity(world: GodWorld, entity: Entity): string {
  return entity.label ?? world.catalog.definitionsById.get(entity.definitionId)?.name ?? entity.id;
}

function findAgentTile(world: GodWorld, agentId: string): Position | null {
  return world.agents.find((agent) => agent.id === agentId)?.pos ?? null;
}

function grab(tool: GodTool, target: GodClickTarget, world: GodWorld): GodClickOutcome {
  if (target.kind === "agent") {
    const agent = world.agents.find((candidate) => candidate.id === target.agentId);
    if (!agent) return { action: null, nextTool: tool };
    const held: HeldThing = { kind: "agent", agentId: agent.id, name: agent.name };
    return { action: null, nextTool: { kind: "holding", held } };
  }
  const entity = findTopEntityAt(world, target.pos);
  if (!entity) return { action: null, nextTool: tool };
  const held: HeldThing = {
    kind: "entity",
    entityId: entity.id,
    name: describeEntity(world, entity),
  };
  return { action: null, nextTool: { kind: "holding", held } };
}

function putDown(held: HeldThing, target: GodClickTarget, world: GodWorld): GodAction | null {
  if (held.kind === "agent") {
    const pos = target.kind === "tile" ? target.pos : findAgentTile(world, target.agentId);
    return pos && { kind: "move_agent", agentId: held.agentId, pos };
  }
  const destination =
    target.kind === "tile"
      ? { kind: "tile" as const, pos: target.pos }
      : { kind: "agent" as const, agentId: target.agentId };
  return { kind: "move_entity", entityId: held.entityId, destination };
}

/**
 * What a click on the map does with the current tool: grab picks up a person or the top thing on a
 * tile, and the next click puts it down on a tile (or, for a thing, in a person's hands); place
 * makes the chosen definition there; delete removes the top thing on a tile.
 */
export function resolveGodClick(
  tool: GodTool,
  target: GodClickTarget,
  world: GodWorld,
): GodClickOutcome {
  switch (tool.kind) {
    case "grab":
      return grab(tool, target, world);
    case "holding":
      return { action: putDown(tool.held, target, world), nextTool: { kind: "grab" } };
    case "place": {
      if (tool.definitionId === null) return { action: null, nextTool: tool };
      const destination =
        target.kind === "tile"
          ? { kind: "tile" as const, pos: target.pos }
          : { kind: "agent" as const, agentId: target.agentId };
      return {
        action: { kind: "place_entity", definitionId: tool.definitionId, destination },
        nextTool: tool,
      };
    }
    case "delete": {
      if (target.kind === "agent") return { action: null, nextTool: tool };
      const entity = findTopEntityAt(world, target.pos);
      return {
        action: entity && { kind: "delete_entity", entityId: entity.id },
        nextTool: tool,
      };
    }
  }
}

/** One line telling the viewer what the next click will do. */
export function describeGodTool(tool: GodTool): string {
  switch (tool.kind) {
    case "grab":
      return "Click a person or a thing to pick it up.";
    case "holding":
      return tool.held.kind === "agent"
        ? `Holding ${tool.held.name}: click a tile to set them down. Esc lets go.`
        : `Holding ${tool.held.name}: click a tile, or a person to hand it to them. Esc lets go.`;
    case "place":
      return tool.definitionId === null
        ? "Choose something to place."
        : "Click a tile to place it, or a person to put it in their hands.";
    case "delete":
      return "Click a tile to delete the top thing on it.";
  }
}
