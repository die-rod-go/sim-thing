import {
  readComponentField,
  type Entity,
  type ItemCatalog,
  type ItemDefinition,
  type Verb,
} from "@village/shared";
import { MINUTES_PER_DAY } from "../economy/types";
import { getDefinition, type EntityWorld } from "./entity-store";
import { resolveNumber } from "./verb-numbers";
import { listVerbsForSubject } from "./verb-offers";

/** Whole units available to take; fractional regrowth only counts once it makes a whole unit. */
export function countWholeStock(entity: Entity): number {
  return Math.floor(entity.state.stock ?? 0);
}

export function takeStock(entity: Entity, amount: number): Entity {
  if (amount === 0) return entity;
  return { ...entity, state: { ...entity.state, stock: (entity.state.stock ?? 0) - amount } };
}

/** One tick of regrowth for every entity with a `stock` component; returns the ones that grew. */
export function regrowStocks(
  entities: readonly Entity[],
  items: ItemCatalog,
  minutesPerTick: number,
): Entity[] {
  const dayFraction = minutesPerTick / MINUTES_PER_DAY;
  return entities.flatMap((entity) => {
    const definition = items.definitionsById.get(entity.definitionId);
    if (!definition) return [];
    const capacity = readComponentField(definition, "stock", "capacity");
    const regrowPerDay = readComponentField(definition, "stock", "regrowPerDay");
    if (typeof capacity !== "number" || typeof regrowPerDay !== "number") return [];
    const current = entity.state.stock ?? 0;
    const regrown = Math.min(capacity, current + regrowPerDay * dayFraction);
    if (regrown === current) return [];
    return [{ ...entity, state: { ...entity.state, stock: regrown } }];
  });
}

/** The least stock any of its verbs takes in one go, or null when none takes stock. */
function findStockPerUse(verbs: readonly Verb[], definition: ItemDefinition): number | null {
  const amounts = verbs.flatMap((verb) =>
    verb.effects.flatMap((effect) =>
      effect.type === "take_stock" && effect.on === "item"
        ? [resolveNumber(effect.amount, definition)]
        : [],
    ),
  );
  const positive = amounts.filter((amount) => amount > 0);
  return positive.length === 0 ? null : Math.min(...positive);
}

/**
 * What an agent standing by a placed entity can see of its state: "open" or "closed" for a door,
 * "empty" or "enough left for 2 more" for something with stock. Null when nothing shows.
 */
export function describeEntityCondition(world: EntityWorld, entity: Entity): string | null {
  if (entity.state.isOpen !== undefined) return entity.state.isOpen ? "open" : "closed";
  if (entity.state.stock === undefined) return null;
  const definition = getDefinition(world, entity);
  const location = definition.form === "placeable" ? "placed" : "ground";
  const verbs = listVerbsForSubject(world, { kind: "entity", definition, location });
  const perUse = findStockPerUse(verbs, definition);
  if (perUse === null) return null;
  const usesLeft = Math.floor(countWholeStock(entity) / perUse);
  return usesLeft === 0 ? "empty" : `enough left for ${usesLeft} more`;
}
