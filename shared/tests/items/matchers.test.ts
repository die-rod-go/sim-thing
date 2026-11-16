import { describe, expect, it } from "vitest";
import { buildItemCatalog, resolveThingComponents } from "../../src/items/catalog";
import type { Matcher } from "../../src/items/matcher-schema";
import { matcherSchema } from "../../src/items/matcher-schema";
import {
  listGuaranteedComponents,
  listMentionedComponents,
  matchesThing,
  requiresWhere,
  type ThingView,
} from "../../src/items/matchers";
import { buildTestItemFile } from "./test-item-file";

const catalog = buildItemCatalog(buildTestItemFile());

function view(definitionId: string, where?: ThingView["where"]): ThingView {
  return { definitionId, components: resolveThingComponents(catalog, definitionId, {}), where };
}

describe("matcher terms", () => {
  it("matches a thing that has the component right now", () => {
    expect(matchesThing({ has: "food" }, view("bread"))).toBe(true);
    expect(matchesThing({ has: "food" }, view("knife"))).toBe(false);
    expect(matchesThing({ has: "flesh" }, view("person"))).toBe(true);
  });

  it("matches a thing of a definition", () => {
    expect(matchesThing({ definition: "oven" }, view("oven"))).toBe(true);
    expect(matchesThing({ definition: "oven" }, view("chest"))).toBe(false);
  });

  it("matches a component the thing gained, even one its definition lacks", () => {
    const bread = view("bread");
    const gained = { ...bread, components: { ...bread.components, burning: {} } };
    expect(matchesThing({ has: "burning" }, gained)).toBe(true);
    expect(matchesThing({ has: "burning" }, bread)).toBe(false);
  });

  it("combines terms with anyOf, allOf and not", () => {
    const sharpMetal: Matcher = { allOf: [{ has: "sharp" }, { has: "metal" }] };
    const edible: Matcher = { anyOf: [{ has: "food" }, { definition: "coin" }] };
    expect(matchesThing(sharpMetal, view("knife"))).toBe(true);
    expect(matchesThing(sharpMetal, view("coin"))).toBe(false);
    expect(matchesThing(edible, view("coin"))).toBe(true);
    expect(matchesThing({ not: edible }, view("oven"))).toBe(true);
  });
});

describe("matcher terms on a body", () => {
  const body = view("person", "here");

  it("matches the body's components, definition and fields", () => {
    expect(matchesThing({ has: "flesh" }, body)).toBe(true);
    expect(matchesThing({ definition: "person" }, body)).toBe(true);
    expect(matchesThing({ field: "health.current", equals: 1 }, body)).toBe(true);
    expect(matchesThing({ field: "health.current", below: 1 }, body)).toBe(false);
  });

  it("matches where the view says the body is", () => {
    expect(matchesThing({ where: "here" }, body)).toBe(true);
    expect(matchesThing({ where: "held" }, body)).toBe(false);
  });

  it("combines terms on a body", () => {
    expect(matchesThing({ allOf: [{ has: "flesh" }, { not: { has: "metal" } }] }, body)).toBe(true);
  });
});

describe("matching a field", () => {
  it("compares with each comparison at its boundary", () => {
    const oven = view("oven");
    expect(matchesThing({ field: "health.current", atLeast: 6 }, oven)).toBe(true);
    expect(matchesThing({ field: "health.current", atMost: 6 }, oven)).toBe(true);
    expect(matchesThing({ field: "health.current", above: 6 }, oven)).toBe(false);
    expect(matchesThing({ field: "health.current", below: 6 }, oven)).toBe(false);
    expect(matchesThing({ field: "health.current", equals: 6 }, oven)).toBe(true);
    expect(matchesThing({ field: "weapon.stimulus", equals: "cut" }, view("knife"))).toBe(true);
  });

  it("never matches a thing lacking the component, whatever the comparison", () => {
    const bread = view("bread");
    expect(matchesThing({ field: "health.current", below: 100 }, bread)).toBe(false);
    expect(matchesThing({ field: "health.current", equals: 0 }, bread)).toBe(false);
    expect(matchesThing({ not: { field: "health.current", below: 100 } }, bread)).toBe(true);
  });
});

describe("matching where a thing is", () => {
  it.each(["held", "here", "inside", "self"] as const)("matches where: %s", (where) => {
    const other = where === "held" ? "here" : "held";
    expect(matchesThing({ where }, view("knife", where))).toBe(true);
    expect(matchesThing({ where }, view("knife", other))).toBe(false);
  });

  it("matches where only when the view says where", () => {
    expect(matchesThing({ where: "held" }, view("knife"))).toBe(false);
    expect(matchesThing({ not: { where: "held" } }, view("knife"))).toBe(true);
  });
});

describe("what a matcher mentions and guarantees", () => {
  const { definitionsById } = catalog;

  it("lists the components has and field terms name, each once", () => {
    const matcher: Matcher = {
      anyOf: [{ has: "food" }, { not: { field: "health.current", atMost: 0 } }, { has: "food" }],
    };
    expect(listMentionedComponents(matcher).sort()).toEqual(["food", "health"]);
    expect(listMentionedComponents({ definition: "knife" })).toEqual([]);
  });

  it("guarantees a has term's component and a field term's component", () => {
    expect([...listGuaranteedComponents({ has: "food" }, definitionsById)]).toEqual(["food"]);
    expect([
      ...listGuaranteedComponents({ field: "health.current", atLeast: 1 }, definitionsById),
    ]).toEqual(["health"]);
  });

  it("guarantees a definition's own components", () => {
    const guaranteed = listGuaranteedComponents({ definition: "knife" }, definitionsById);
    expect([...guaranteed].sort()).toEqual(["holdable", "metal", "sharp", "weapon"]);
  });

  it("guarantees the union over allOf and the intersection over anyOf", () => {
    const both = listGuaranteedComponents(
      { allOf: [{ has: "food" }, { has: "holdable" }] },
      definitionsById,
    );
    expect([...both].sort()).toEqual(["food", "holdable"]);
    const either = listGuaranteedComponents(
      { anyOf: [{ definition: "knife" }, { definition: "coin" }] },
      definitionsById,
    );
    expect([...either].sort()).toEqual(["holdable", "metal"]);
  });

  it("guarantees nothing through not, where or an empty anyOf", () => {
    expect(listGuaranteedComponents({ not: { has: "food" } }, definitionsById).size).toBe(0);
    expect(listGuaranteedComponents({ where: "held" }, definitionsById).size).toBe(0);
    expect(listGuaranteedComponents({ anyOf: [] }, definitionsById).size).toBe(0);
  });

  it("knows when every match is where the matcher says", () => {
    expect(requiresWhere({ where: "held" }, "held")).toBe(true);
    expect(requiresWhere({ where: "here" }, "held")).toBe(false);
    expect(requiresWhere({ allOf: [{ has: "food" }, { where: "held" }] }, "held")).toBe(true);
    expect(requiresWhere({ anyOf: [{ where: "held" }, { has: "food" }] }, "held")).toBe(false);
    expect(
      requiresWhere({ anyOf: [{ where: "held" }, { allOf: [{ where: "held" }] }] }, "held"),
    ).toBe(true);
    expect(requiresWhere({ not: { where: "held" } }, "held")).toBe(false);
  });
});

describe("matcher shape", () => {
  it("needs exactly one comparison on a field term", () => {
    expect(matcherSchema.safeParse({ field: "health.current" }).success).toBe(false);
    expect(matcherSchema.safeParse({ field: "health.current", above: 0, below: 1 }).success).toBe(
      false,
    );
    expect(matcherSchema.safeParse({ field: "health.current", above: 0 }).success).toBe(true);
  });
});
