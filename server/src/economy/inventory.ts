export type Inventory = Record<string, number>;

export function countItem(inventory: Inventory, item: string): number {
  return inventory[item] ?? 0;
}

export function addItem(inventory: Inventory, item: string, amount: number): Inventory {
  return removeEmptyEntries({ ...inventory, [item]: countItem(inventory, item) + amount });
}

/** Throws when removing more than is held: callers check with `findMissingItems` first. */
export function removeItem(inventory: Inventory, item: string, amount: number): Inventory {
  const remaining = countItem(inventory, item) - amount;
  if (remaining < 0) {
    throw new Error(`Cannot remove ${amount} ${item}: only ${countItem(inventory, item)} held`);
  }
  return removeEmptyEntries({ ...inventory, [item]: remaining });
}

export function addItems(inventory: Inventory, items: Inventory): Inventory {
  return Object.entries(items).reduce(
    (updated, [item, amount]) => addItem(updated, item, amount),
    inventory,
  );
}

export function removeItems(inventory: Inventory, items: Inventory): Inventory {
  return Object.entries(items).reduce(
    (updated, [item, amount]) => removeItem(updated, item, amount),
    inventory,
  );
}

/** How many of each required item are missing; empty when everything is held. */
export function findMissingItems(inventory: Inventory, required: Inventory): Inventory {
  const missing: Inventory = {};
  for (const [item, amount] of Object.entries(required)) {
    const shortfall = amount - countItem(inventory, item);
    if (shortfall > 0) {
      missing[item] = shortfall;
    }
  }
  return missing;
}

function removeEmptyEntries(inventory: Inventory): Inventory {
  return Object.fromEntries(Object.entries(inventory).filter(([, amount]) => amount > 0));
}
