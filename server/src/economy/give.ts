import {
  describeCount,
  findDefinitionByName,
  type Agent,
  type Entity,
  type ItemDefinition,
  type Position,
} from "@village/shared";
import { config } from "../config";
import {
  getDefinition,
  isEntityNamed,
  listHeldEntities,
  locateInside,
  moveEntity,
  type EntityWorld,
} from "../items/entity-store";
import { failWith, type MechanicResult } from "./types";

export interface GiveRequest {
  giver: Agent;
  recipient: Agent;
  /** What the reply named: a definition's name or plural ("bread", "coins"). */
  itemName: string;
  amount: number;
  reachTiles?: number;
}

export interface GiveOutcome {
  definitionId: string;
  /** "3 coins", "a knife". */
  description: string;
  amount: number;
  movedEntityIds: string[];
}

/** Why the give can't happen, or the entities it would hand over: the oldest matching ones. */
export function chooseEntitiesToGive(
  world: EntityWorld,
  request: GiveRequest,
): MechanicResult<{ definitionId: string; description: string; entityIds: string[] }> {
  const { giver, recipient, amount } = request;
  const reachTiles = request.reachTiles ?? config.economy.giveReachTiles;
  if (giver.id === recipient.id) return failWith("I can't hand something to myself");
  if (computeChebyshevDistance(giver.pos, recipient.pos) > reachTiles) {
    return failWith(
      `${recipient.name} is too far away to hand anything to: I have to be right next to them`,
    );
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return failWith("I can only hand over a whole number of things, at least one");
  }
  const held = listHeldEntities(world, giver.id).filter((entity) =>
    isEntityNamed(world, entity, request.itemName),
  );
  const [first] = held;
  if (first === undefined) {
    const definition = findDefinitionByName(world.items, request.itemName);
    const name = definition?.plural ?? definition?.name ?? request.itemName.trim().toLowerCase();
    return failWith(`I don't have any ${name}`);
  }
  const definition = getDefinition(world, first);
  if (held.length < amount) {
    return failWith(`I only have ${describeHeld(first, definition, held.length)}`);
  }
  return {
    isSuccess: true,
    definitionId: first.definitionId,
    description: describeHeld(first, definition, amount),
    entityIds: held.slice(0, amount).map((entity) => entity.id),
  };
}

/** A labelled thing goes by its label ("woodcutter's axe 1"), any other by count ("3 coins"). */
function describeHeld(entity: Entity, definition: ItemDefinition, count: number): string {
  return entity.label ?? describeCount(definition, count);
}

/**
 * Hands items, coins included, from one agent to another nearby, oldest first. Whatever leaves the
 * giver arrives at the recipient, so nothing is created or destroyed.
 */
export function executeGive(world: EntityWorld, request: GiveRequest): MechanicResult<GiveOutcome> {
  const chosen = chooseEntitiesToGive(world, request);
  if (!chosen.isSuccess) return chosen;
  for (const entityId of chosen.entityIds) {
    moveEntity(world, entityId, locateInside(request.recipient.id));
  }
  return {
    isSuccess: true,
    definitionId: chosen.definitionId,
    description: chosen.description,
    amount: request.amount,
    movedEntityIds: chosen.entityIds,
  };
}

export function computeChebyshevDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}
