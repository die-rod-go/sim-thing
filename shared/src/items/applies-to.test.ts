import { describe, expect, it } from "vitest";
import {
  listGuaranteedComponents,
  matchesRule,
  requiresHeldOrUser,
  type RuleSubject,
  type SubjectLocation,
} from "./applies-to";
import { buildItemCatalog, findDefinition } from "./catalog";
import type { AppliesToRule } from "./item-file";
import { buildTestItemFile } from "./test-item-file";

const catalog = buildItemCatalog(buildTestItemFile());

function entity(definitionId: string, location: SubjectLocation = "held"): RuleSubject {
  return { kind: "entity", definition: findDefinition(catalog, definitionId), location };
}

const user: RuleSubject = { kind: "user", properties: ["flesh"] };
const deadAgent: RuleSubject = { kind: "dead_agent", properties: ["flesh"] };
const livingAgent: RuleSubject = { kind: "living_agent", properties: ["flesh"] };

describe("appliesTo terms", () => {
  it("matches entities of a definition", () => {
    expect(matchesRule({ definition: "knife" }, entity("knife"))).toBe(true);
    expect(matchesRule({ definition: "knife" }, entity("bread"))).toBe(false);
  });

  it("matches entities that have a component", () => {
    expect(matchesRule({ component: "food" }, entity("bread"))).toBe(true);
    expect(matchesRule({ component: "food" }, entity("knife"))).toBe(false);
  });

  it("matches entities by form", () => {
    expect(matchesRule({ form: "placeable" }, entity("oven", "placed"))).toBe(true);
    expect(matchesRule({ form: "placeable" }, entity("knife"))).toBe(false);
  });

  it("matches a property on entities, the user and dead agents but never other living agents", () => {
    expect(matchesRule({ property: "sharp" }, entity("knife"))).toBe(true);
    expect(matchesRule({ property: "flesh" }, user)).toBe(true);
    expect(matchesRule({ property: "flesh" }, deadAgent)).toBe(true);
    expect(matchesRule({ property: "flesh" }, livingAgent)).toBe(false);
  });

  it("matches where an entity is", () => {
    expect(matchesRule({ location: "held" }, entity("knife", "held"))).toBe(true);
    expect(matchesRule({ location: "held" }, entity("knife", "ground"))).toBe(false);
    expect(matchesRule({ location: "ground" }, entity("knife", "inside"))).toBe(false);
  });

  it("matches dead agents and the user with their own terms", () => {
    expect(matchesRule({ isDeadAgent: true }, deadAgent)).toBe(true);
    expect(matchesRule({ isDeadAgent: true }, user)).toBe(false);
    expect(matchesRule({ isUser: true }, user)).toBe(true);
    expect(matchesRule({ isUser: true }, entity("knife"))).toBe(false);
  });
});

describe("appliesTo combinators", () => {
  const heldFood: AppliesToRule = { allOf: [{ component: "food" }, { location: "held" }] };

  it("needs every part of allOf", () => {
    expect(matchesRule(heldFood, entity("bread", "held"))).toBe(true);
    expect(matchesRule(heldFood, entity("bread", "ground"))).toBe(false);
  });

  it("needs any part of anyOf", () => {
    const rule: AppliesToRule = { anyOf: [{ component: "container" }, { isDeadAgent: true }] };
    expect(matchesRule(rule, entity("chest", "placed"))).toBe(true);
    expect(matchesRule(rule, deadAgent)).toBe(true);
    expect(matchesRule(rule, user)).toBe(false);
  });

  it("inverts with not", () => {
    const rule: AppliesToRule = { allOf: [{ form: "carriable" }, { not: { definition: "coin" } }] };
    expect(matchesRule(rule, entity("bread"))).toBe(true);
    expect(matchesRule(rule, entity("coin"))).toBe(false);
  });
});

describe("what a rule guarantees", () => {
  it("guarantees the components every branch requires", () => {
    const rule: AppliesToRule = {
      anyOf: [
        { allOf: [{ component: "weapon" }, { component: "weight" }] },
        { allOf: [{ component: "weapon" }, { location: "held" }] },
      ],
    };
    expect([...listGuaranteedComponents(rule, catalog.definitionsById)]).toEqual(["weapon"]);
  });

  it("guarantees a named definition's own components", () => {
    const guaranteed = listGuaranteedComponents({ definition: "knife" }, catalog.definitionsById);
    expect(guaranteed.has("weapon")).toBe(true);
  });

  it("guarantees nothing through not", () => {
    const rule: AppliesToRule = { not: { component: "weapon" } };
    expect(listGuaranteedComponents(rule, catalog.definitionsById).size).toBe(0);
  });

  it("knows when every match is held or the user", () => {
    expect(requiresHeldOrUser({ allOf: [{ component: "weapon" }, { location: "held" }] })).toBe(
      true,
    );
    expect(requiresHeldOrUser({ isUser: true })).toBe(true);
    expect(requiresHeldOrUser({ anyOf: [{ location: "held" }, { component: "weapon" }] })).toBe(
      false,
    );
  });
});
