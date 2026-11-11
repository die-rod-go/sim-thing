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
  return { definitionId, usedBy: `map object "${definitionId}"` };
}

function seedItem(definitionId: string): ItemReference {
  return { definitionId, usedBy: "seed agent mara's inventory" };
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

  it("refuses a map object or seed inventory naming the agents' body", () => {
    expect(() => buildCheckedItemCatalog(itemsJson, [mapObject("person")])).toThrow(
      /the agents' body/,
    );
    expect(() => buildCheckedItemCatalog(itemsJson, [seedItem("person")])).toThrow(
      /the agents' body/,
    );
  });

  it("accepts a map object naming something holdable and an inventory naming something fixed", () => {
    expect(() =>
      buildCheckedItemCatalog(itemsJson, [mapObject("bread"), seedItem("oven")]),
    ).not.toThrow();
  });

  it("refuses a seed inventory naming an unknown definition", () => {
    expect(() => buildCheckedItemCatalog(itemsJson, [seedItem("lute")])).toThrow(/"lute"/);
  });

  it("refuses a malformed file", () => {
    expect(() => buildCheckedItemCatalog({ definitions: "none" }, [])).toThrow(/malformed/);
  });
});
