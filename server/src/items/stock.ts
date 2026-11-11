import type { Entity } from "@village/shared";
import { MINUTES_PER_HOUR } from "../economy/types";
import type { TickContext } from "../sim/tick-context";
import { markEntityChanged, unmarkEntityChanged } from "../sim/world-access";
import { writeField } from "./thing-writes";
import { readNumberField, type ThingRef } from "./things";
import type { EntityWorld } from "./entity-store";

/*
 * Transitional: the stock and regrowth rules name these components until later phases make them
 * data.
 */
export const STOCK_AMOUNT_FIELD = "stock.amount";
export const REGROWS_PER_HOUR_FIELD = "regrows.perHour";

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

/**
 * One tick of regrowth for every entity with a stock that regrows. Fractions grow every tick;
 * viewers only need to hear when a whole unit is back.
 */
export function regrowStocks(context: TickContext, minutesPerTick: number): void {
  const { state, result } = context;
  for (const entity of [...state.entities]) {
    const thing = referTo(entity);
    const stock = readNumberField(state, thing, STOCK_AMOUNT_FIELD);
    const perHour = readNumberField(state, thing, REGROWS_PER_HOUR_FIELD);
    if (stock === null || perHour === null) continue;
    const wasChanged = result.changedEntityIds.includes(entity.id);
    const wholeBefore = countWholeStock(state, entity);
    writeField(
      context,
      thing,
      STOCK_AMOUNT_FIELD,
      stock + (perHour * minutesPerTick) / MINUTES_PER_HOUR,
    );
    if (countWholeStock(state, entity) !== wholeBefore) markEntityChanged(result, entity.id);
    else if (!wasChanged) unmarkEntityChanged(result, entity.id);
  }
}
