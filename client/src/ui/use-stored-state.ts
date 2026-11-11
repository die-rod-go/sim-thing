import { useEffect, useState } from "react";

/*
 * Storage can be missing or blocked (private windows, cleared site data). Remembered layout is a
 * convenience, so a failed read means "use the default" and a failed write means "not remembered".
 */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

/** State remembered in this browser only, restored on reload. */
export function useStoredState<Value>(
  key: string,
  defaultValue: Value,
  parse: (raw: string | null) => Value | null,
  serialize: (value: Value) => string = String,
): [Value, (value: Value) => void] {
  const [value, setValue] = useState<Value>(() => parse(readStorage(key)) ?? defaultValue);
  useEffect(() => writeStorage(key, serialize(value)), [key, value, serialize]);
  return [value, setValue];
}
