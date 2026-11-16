import { describe, expect, it } from "vitest";
import {
  describeThingView,
  isBareHanded,
  isLyingWhenOnTile,
  listAddableComponents,
  listAllVerbViews,
  listDefinitionViews,
  listPossibleWheres,
  listViewsWithAddedComponents,
  matchesAppliesTo,
} from "../../src/items/applies-to";
import { buildItemCatalog, resolveThingComponents } from "../../src/items/catalog";
import type { Verb } from "../../src/items/item-file";
import type { ThingView } from "../../src/items/matchers";
import { buildTestItemFile } from "./test-item-file";

const file = buildTestItemFile();
const catalog = buildItemCatalog(file);

function view(definitionId: string, where: ThingView["where"] = "held"): ThingView {
  return { definitionId, components: resolveThingComponents(catalog, definitionId, {}), where };
}

function verbWith(appliesTo: Verb["appliesTo"]): Verb {
  const [eat] = file.verbs;
  if (eat === undefined) throw new Error("the test file has no verb");
  return { ...eat, appliesTo };
}

describe("a verb's appliesTo meeting a thing", () => {
  it("applies when its matcher matches the view", () => {
    const eat = verbWith({ allOf: [{ has: "food" }, { where: "held" }] });
    expect(matchesAppliesTo(eat, view("bread", "held"))).toBe(true);
    expect(matchesAppliesTo(eat, view("bread", "here"))).toBe(false);
    expect(matchesAppliesTo(eat, view("knife", "held"))).toBe(false);
  });

  it("never applies to a thing when the verb is bare-handed", () => {
    const punch = verbWith(undefined);
    expect(isBareHanded(punch)).toBe(true);
    expect(matchesAppliesTo(punch, view("knife"))).toBe(false);
    expect(isBareHanded(verbWith({ has: "food" }))).toBe(false);
  });
});

describe("where things can be met", () => {
  it("lets what lies loose be held, here or inside, and everything else only be here", () => {
    const knife = catalog.definitionsById.get("knife");
    const oven = catalog.definitionsById.get("oven");
    if (knife === undefined || oven === undefined) throw new Error("missing test definition");
    expect(listPossibleWheres(file, knife)).toEqual(["held", "here", "inside"]);
    expect(listPossibleWheres(file, oven)).toEqual(["here"]);
    expect(listDefinitionViews(file, oven).map(describeThingView)).toEqual(["oven (here)"]);
  });

  it("says whether something with these components lies on the floor", () => {
    const bread = resolveThingComponents(catalog, "bread", {});
    const oven = resolveThingComponents(catalog, "oven", {});
    expect(isLyingWhenOnTile(file, "bread", bread)).toBe(true);
    expect(isLyingWhenOnTile(file, "oven", oven)).toBe(false);
  });

  it("lists every definition but the body in each place", () => {
    const described = listAllVerbViews(file).map(describeThingView);
    expect(described).toContain("knife (held)");
    expect(described).toContain("chest (here)");
    expect(described.filter((entry) => entry.startsWith("person"))).toEqual([]);
  });
});

describe("components that steps add", () => {
  const withCondition = buildTestItemFile({
    components: { ...file.components, burning: {} },
    verbs: [
      {
        name: "light",
        appliesTo: { has: "holdable" },
        steps: [{ step: "add", on: "item", component: "burning" }],
      },
    ],
  });

  it("lists the components add steps name", () => {
    expect(listAddableComponents(withCondition)).toEqual(["burning"]);
    expect(listAddableComponents(file)).toEqual([]);
  });

  it("gives every view the addable components too", () => {
    const [bread] = listViewsWithAddedComponents(withCondition, [view("bread")]);
    expect(Object.hasOwn(bread?.components ?? {}, "burning")).toBe(true);
    expect(Object.hasOwn(bread?.components ?? {}, "food")).toBe(true);
  });
});
