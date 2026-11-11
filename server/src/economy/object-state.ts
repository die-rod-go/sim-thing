import type { WorldObject } from "@village/shared";
import { config, type ObjectKindConfig } from "../config";
import { MINUTES_PER_DAY, failWith, type MechanicResult } from "./types";

export function addObjectUser(object: WorldObject, agentId: string): WorldObject {
  const userIds = object.state.userIds ?? [];
  if (userIds.includes(agentId)) {
    return object;
  }
  return { ...object, state: { ...object.state, userIds: [...userIds, agentId] } };
}

export function removeObjectUser(object: WorldObject, agentId: string): WorldObject {
  const userIds = object.state.userIds ?? [];
  if (!userIds.includes(agentId)) {
    return object;
  }
  const remaining = userIds.filter((userId) => userId !== agentId);
  return { ...object, state: { ...object.state, userIds: remaining } };
}

export function countOtherUsers(object: WorldObject, agentId: string): number {
  return (object.state.userIds ?? []).filter((userId) => userId !== agentId).length;
}

/** Whole units available to take; fractional regrowth only counts once it makes a whole unit. */
export function countWholeStock(object: WorldObject): number {
  return Math.floor(object.state.stock ?? 0);
}

export function takeStock(object: WorldObject, amount: number): WorldObject {
  if (amount === 0) {
    return object;
  }
  return { ...object, state: { ...object.state, stock: (object.state.stock ?? 0) - amount } };
}

/** One tick of regrowth for every object kind with a stock; missing stock counts as empty. */
export function regrowStocks(objects: WorldObject[], minutesPerTick: number): WorldObject[] {
  const dayFraction = minutesPerTick / MINUTES_PER_DAY;
  return objects.map((object) => {
    const kindConfig: ObjectKindConfig = config.objects[object.kind];
    const stockConfig = kindConfig.stock;
    if (stockConfig === undefined) {
      return object;
    }
    const current = object.state.stock ?? 0;
    const regrown = Math.min(
      stockConfig.capacity,
      current + stockConfig.regrowPerDay * dayFraction,
    );
    if (regrown === current) {
      return object;
    }
    return { ...object, state: { ...object.state, stock: regrown } };
  });
}

export function setDoorOpen(
  object: WorldObject,
  isOpen: boolean,
): MechanicResult<{ object: WorldObject }> {
  if (object.kind !== "door") {
    return failWith(`The ${object.name} isn't a door`);
  }
  if ((object.state.isOpen ?? false) === isOpen) {
    return failWith(`The ${object.name} is already ${isOpen ? "open" : "closed"}`);
  }
  return { isSuccess: true, object: { ...object, state: { ...object.state, isOpen } } };
}

/**
 * What an agent standing by the object can see of its state, e.g. "empty" or "enough left for
 * 2 more" for a stocked object and "open" or "closed" for a door. Null when there is nothing to see.
 */
export function describeObjectCondition(object: WorldObject): string | null {
  if (object.kind === "door") {
    return (object.state.isOpen ?? false) ? "open" : "closed";
  }
  const unitsPerUse = findStockUsedPerUse(object);
  if (unitsPerUse === undefined) {
    return null;
  }
  const usesLeft = Math.floor(countWholeStock(object) / unitsPerUse);
  return usesLeft === 0 ? "empty" : `enough left for ${usesLeft} more`;
}

function findStockUsedPerUse(object: WorldObject): number | undefined {
  const stockUses = config.objects[object.kind].interactions
    .map((interaction) => config.interactions[interaction]?.stockUsed ?? 0)
    .filter((stockUsed) => stockUsed > 0);
  return stockUses.length === 0 ? undefined : Math.min(...stockUses);
}
