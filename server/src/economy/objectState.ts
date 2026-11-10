import type { WorldObject } from "@village/shared";
import { config, type ObjectKindConfig } from "../config";
import { MINUTES_PER_DAY, capitalize, failWith, type MechanicResult } from "./types";

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
    return failWith(`${capitalize(object.name)} isn't a door`);
  }
  if ((object.state.isOpen ?? false) === isOpen) {
    return failWith(`${capitalize(object.name)} is already ${isOpen ? "open" : "closed"}`);
  }
  return { isSuccess: true, object: { ...object, state: { ...object.state, isOpen } } };
}
