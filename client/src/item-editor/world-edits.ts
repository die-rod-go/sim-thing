import type { ItemFile, WorldSettings } from "@village/shared";

/** One world setting set; a matcher setting given undefined is dropped (it then matches nothing). */
export function setWorldSetting<Key extends keyof WorldSettings>(
  file: ItemFile,
  key: Key,
  value: WorldSettings[Key] | undefined,
): ItemFile {
  const world = { ...file.world, [key]: value };
  if (value === undefined) delete world[key];
  return { ...file, world };
}
