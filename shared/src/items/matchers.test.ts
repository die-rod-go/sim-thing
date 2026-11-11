import { describe, expect, it } from "vitest";
import { buildItemCatalog, resolveThingComponents } from "./catalog";
import type { Matcher } from "./matcher-schema";
import { matcherSchema } from "./matcher-schema";
import { matchesThing, type ThingView } from "./matchers";
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

  it("compares a field with a literal", () => {
    expect(matchesThing({ field: "health.current", atLeast: 6 }, view("oven"))).toBe(true);
    expect(matchesThing({ field: "health.current", above: 6 }, view("oven"))).toBe(false);
    expect(matchesThing({ field: "health.current", atMost: 1 }, view("person"))).toBe(true);
    expect(matchesThing({ field: "health.current", below: 1 }, view("person"))).toBe(false);
    expect(matchesThing({ field: "weapon.stimulus", equals: "cut" }, view("knife"))).toBe(true);
  });

  it("never matches a field of a component the thing lacks", () => {
    expect(matchesThing({ field: "health.current", atMost: 100 }, view("bread"))).toBe(false);
  });

  it("matches where a thing is only when the view says where", () => {
    expect(matchesThing({ where: "held" }, view("knife", "held"))).toBe(true);
    expect(matchesThing({ where: "held" }, view("knife", "here"))).toBe(false);
    expect(matchesThing({ where: "held" }, view("knife"))).toBe(false);
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

describe("matcher shape", () => {
  it("needs exactly one comparison on a field term", () => {
    expect(matcherSchema.safeParse({ field: "health.current" }).success).toBe(false);
    expect(matcherSchema.safeParse({ field: "health.current", above: 0, below: 1 }).success).toBe(
      false,
    );
    expect(matcherSchema.safeParse({ field: "health.current", above: 0 }).success).toBe(true);
  });
});
