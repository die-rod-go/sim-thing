import type { Entity } from "@village/shared";
import type { TickContext } from "../sim/tick-context";
import { writeField } from "./thing-writes";
import { readNumberField, type ThingRef } from "./things";
import type { EntityWorld } from "./entity-store";

/*
 * Transitional: `take_stock` names this component until a later phase makes it data.
 */
export const STOCK_AMOUNT_FIELD = "stock.amount";

function referTo(entity: Entity): ThingRef {
  return { kind: "entity", entityId: entity.id };
}

/** Whole units available to take; fractional regrowth only counts once it makes a whole unit. */
export function countWholeStock(world: EntityWorld, entity: Entity): number {
  return Math.floor(readNumberField(world, referTo(entity), STOCK_AMOUNT_FIELD) ?? 0);
}

/** Takes `amount` out of the stock field. */
export function takeStock(context: TickContext, entity: Entity, amount: number): void {
  if (amount === 0) return;
  const stock = readNumberField(context.state, referTo(entity), STOCK_AMOUNT_FIELD) ?? 0;
  writeField(context, referTo(entity), STOCK_AMOUNT_FIELD, stock - amount);
}
