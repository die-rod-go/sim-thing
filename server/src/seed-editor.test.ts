import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ItemCatalog } from "@village/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedEditor } from "./seed-editor";
import { buildEmptyItems, loadTestItems, loadTestMap, loadTestSeeds } from "./sim/test-sim";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("seed editor", () => {
  it("checks seeds against the item catalog as it is now, not as it was at startup", () => {
    const directory = mkdtempSync(join(tmpdir(), "seed-editor-"));
    temporaryDirectories.push(directory);
    const map = loadTestMap();
    let items: ItemCatalog = buildEmptyItems();
    const editor = createSeedEditor({
      seedFilePath: join(directory, "agents.json"),
      getMap: () => map,
      getItems: () => items,
    });
    const seedFile = loadTestSeeds();
    expect(editor.saveSeedFile(seedFile).isSaved).toBe(false);
    items = loadTestItems();
    expect(editor.saveSeedFile(seedFile).isSaved).toBe(true);
  });
});
