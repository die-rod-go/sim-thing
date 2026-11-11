/* Small immutable list and record edits shared by every tab of the item editor. */

export function replaceAt<Value>(list: readonly Value[], index: number, value: Value): Value[] {
  return list.map((current, currentIndex) => (currentIndex === index ? value : current));
}

export function removeAt<Value>(list: readonly Value[], index: number): Value[] {
  return list.filter((_, currentIndex) => currentIndex !== index);
}

/** Moves one entry to a new position; out-of-range moves leave the list as it is. */
export function moveWithin<Value>(
  list: readonly Value[],
  fromIndex: number,
  toIndex: number,
): Value[] {
  const moved = list[fromIndex];
  if (moved === undefined || toIndex < 0 || toIndex >= list.length) return [...list];
  const without = removeAt(list, fromIndex);
  return [...without.slice(0, toIndex), moved, ...without.slice(toIndex)];
}

/** `base`, or `base_2`, `base_3`, ... when it is taken. */
export function createUniqueName(
  base: string,
  takenNames: Iterable<string>,
  separator = "_",
): string {
  const taken = new Set(takenNames);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}${separator}${suffix}`)) suffix += 1;
  return `${base}${separator}${suffix}`;
}

/** Renames a key, keeping its place in the record's order. */
export function renameKey<Value>(
  record: Readonly<Record<string, Value>>,
  oldKey: string,
  newKey: string,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === oldKey ? newKey : key, value]),
  );
}

export function withoutKey<Value>(
  record: Readonly<Record<string, Value>>,
  removedKey: string,
): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== removedKey));
}

export function toggleInList(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((current) => current !== value) : [...list, value];
}
