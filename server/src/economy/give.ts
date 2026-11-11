import { describeCount, findDefinitionByName, type Agent, type Position } from "@village/shared";
import { config } from "../config";
import {
  listHeldOfDefinition,
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
): MechanicResult<{ definitionId: string; entityIds: string[] }> {
  const { giver, recipient, amount } = request;
  const reachTiles = request.reachTiles ?? config.economy.giveReachTiles;
  if (giver.id === recipient.id) return failWith("I can't hand something to myself");
  if (computeChebyshevDistance(giver.pos, recipient.pos) > reachTiles) {
    return failWith(`${recipient.name} is too far away to hand anything to`);
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return failWith("I can only hand over a whole number of things, at least one");
  }
  const definition = findDefinitionByName(world.items, request.itemName);
  if (!definition) return failWith(`I don't have any ${request.itemName.trim().toLowerCase()}`);
  const held = listHeldOfDefinition(world, giver.id, definition.id);
  if (held.length < amount) {
    return failWith(
      held.length === 0
        ? `I don't have any ${definition.plural ?? definition.name}`
        : `I only have ${describeCount(definition, held.length)}`,
    );
  }
  return {
    isSuccess: true,
    definitionId: definition.id,
    entityIds: held.slice(0, amount).map((entity) => entity.id),
  };
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
  const definition = world.items.definitionsById.get(chosen.definitionId);
  return {
    isSuccess: true,
    definitionId: chosen.definitionId,
    description: definition ? describeCount(definition, request.amount) : chosen.definitionId,
    amount: request.amount,
    movedEntityIds: chosen.entityIds,
  };
}

export function computeChebyshevDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}
