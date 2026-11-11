import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ItemReference } from "@village/shared";
import { config } from "../config";
import { buildCheckedItemCatalog } from "./load-items";

const itemsJson: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../..", config.server.itemsPath), "utf8"),
);

function mapObject(definitionId: string): ItemReference {
  return { definitionId, requiredForm: "placeable", usedBy: `map object "${definitionId}"` };
}

function seedItem(definitionId: string): ItemReference {
  return { definitionId, requiredForm: "carriable", usedBy: "seed agent mara's inventory" };
}

describe("loading items.json", () => {
  it("accepts the project's items with the map's objects and seed inventories", () => {
    const catalog = buildCheckedItemCatalog(itemsJson, [mapObject("oven"), seedItem("coin")]);
    expect(catalog.definitionsById.get("coin")?.plural).toBe("coins");
  });

  it("refuses a map object naming an unknown definition", () => {
    expect(() => buildCheckedItemCatalog(itemsJson, [mapObject("anvil")])).toThrow(
      /map object "anvil" uses "anvil", which has no definition/,
    );
  });

  it("refuses a map object naming something carriable", () => {
    expect(() => buildCheckedItemCatalog(itemsJson, [mapObject("bread")])).toThrow(
      /needs a placeable item, but bread is carriable/,
    );
  });

  it("refuses a seed inventory naming an unknown or placeable definition", () => {
    expect(() => buildCheckedItemCatalog(itemsJson, [seedItem("lute")])).toThrow(/"lute"/);
    expect(() => buildCheckedItemCatalog(itemsJson, [seedItem("oven")])).toThrow(
      /needs a carriable item, but oven is placeable/,
    );
  });

  it("refuses a malformed file", () => {
    expect(() => buildCheckedItemCatalog({ definitions: "none" }, [])).toThrow(/malformed/);
  });

  it("refuses content this build can't run yet rather than ignoring it", () => {
    const file = itemsJson as { verbs: unknown[] };
    const withPunch = {
      ...file,
      verbs: [
        ...file.verbs,
        {
          name: "shout",
          appliesTo: { isUser: true },
          effects: [{ type: "emit", on: "user", stimulus: "noise" }],
        },
      ],
    };
    expect(() => buildCheckedItemCatalog(withPunch, [])).toThrow(/The emit effect isn't built yet/);
  });
});
