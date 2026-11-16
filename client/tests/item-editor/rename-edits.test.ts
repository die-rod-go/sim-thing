import { describe, expect, it } from "vitest";
import type { ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import {
  renameComponentEverywhere,
  renameDefinitionEverywhere,
  renameFieldEverywhere,
} from "../../src/item-editor/rename-edits";

function findDefinition(file: ItemFile, id: string) {
  const definition = file.definitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`no ${id} in the test file`);
  return definition;
}

function buildRichFile(): ItemFile {
  const base = buildTestItemFile();
  return {
    ...base,
    world: { ...base.world, sightBlockedBy: { anyOf: [{ not: { has: "health" } }] } },
    components: {
      ...base.components,
      pocket: {
        description: "",
        isVisible: false,
        fields: { held: { type: "item", description: "", default: "knife" } },
      },
    },
    definitions: base.definitions.map((definition) =>
      definition.id === "chest"
        ? { ...definition, components: { ...definition.components, pocket: { held: "knife" } } }
        : definition,
    ),
    verbs: [
      {
        name: "mend",
        appliesTo: { allOf: [{ field: "health.current", below: 1 }, { definition: "knife" }] },
        target: { has: "health" },
        reach: { from: "user.health.max", times: "user.health.max" },
        takes: [],
        isDoneInPassing: false,
        phrases: {},
        steps: [
          { step: "require", in: "user", rule: { has: "health" }, count: 1 },
          { step: "check", on: "item", if: { not: { has: "health" } }, otherwise: "no" },
          {
            step: "change",
            on: "item",
            field: "health.current",
            by: { from: "item.health.max", times: "user.health.max" },
          },
          {
            step: "add",
            on: "item",
            component: "health",
            fields: { max: 1, current: { from: "user.health.max" } },
          },
          { step: "remove", on: "item", component: "health" },
          {
            step: "create",
            item: "knife",
            count: 1,
            fields: { "health.max": 3, "pocket.held": "knife" },
          },
          { step: "transform", on: "item", into: "knife" },
          { step: "set", on: "item", field: "pocket.held", to: "knife" },
          { step: "read", on: "item", field: "weapon.stimulus", author: "health.current" },
          { step: "change", on: "item", field: "capacity.max", by: { from: "item.capacity.max" } },
        ],
      },
    ],
    rules: [
      {
        trigger: "every",
        minutes: 5,
        if: { has: "health" },
        steps: [
          {
            step: "damage",
            on: "self",
            field: "health.current",
            amount: { from: "self.health.max" },
          },
        ],
      },
    ],
  };
}

describe("renameComponentEverywhere", () => {
  it("reaches matchers, steps, value reads, world settings and definitions", () => {
    const renamed = renameComponentEverywhere(buildRichFile(), "health", "vitality");
    const text = JSON.stringify(renamed);
    expect(text).not.toContain('"health');
    expect(text).not.toContain(".health.");
    expect(renamed.world.agentHealth).toBe("vitality.current");
    expect(renamed.world.sightBlockedBy).toEqual({ anyOf: [{ not: { has: "vitality" } }] });
    expect(renamed.verbs[0]?.reach).toEqual({
      from: "user.vitality.max",
      times: "user.vitality.max",
    });
    expect(findDefinition(renamed, "oven").components).toEqual({
      vitality: { max: 6, current: 6 },
    });
  });

  it("keeps the declaration order and the other components alone", () => {
    const renamed = renameComponentEverywhere(buildRichFile(), "health", "vitality");
    expect(Object.keys(renamed.components)[0]).toBe("vitality");
    expect(JSON.stringify(renamed.verbs[0]?.steps)).toContain("capacity.max");
  });

  it("does nothing when the new name is taken, empty or the same", () => {
    const file = buildRichFile();
    expect(renameComponentEverywhere(file, "health", "capacity")).toBe(file);
    expect(renameComponentEverywhere(file, "health", "")).toBe(file);
    expect(renameComponentEverywhere(file, "health", "health")).toBe(file);
  });
});

describe("renameFieldEverywhere", () => {
  it("reaches paths, reads, added fields, definition values and sibling bounds", () => {
    const renamed = renameFieldEverywhere(buildRichFile(), "health", "max", "ceiling");
    const steps = JSON.stringify(renamed.verbs[0]?.steps);
    expect(steps).toContain('"health.ceiling":3');
    expect(steps).toContain("item.health.ceiling");
    expect(steps).toContain('"fields":{"ceiling":1');
    expect(renamed.verbs[0]?.reach).toEqual({
      from: "user.health.ceiling",
      times: "user.health.ceiling",
    });
    expect(renamed.components.health?.fields.current?.max).toBe("ceiling");
    expect(Object.keys(renamed.components.health?.fields ?? {})).toEqual(["ceiling", "current"]);
    expect(findDefinition(renamed, "oven").components.health).toEqual({
      ceiling: 6,
      current: 6,
    });
  });

  it("leaves a same-named field of another component alone", () => {
    const renamed = renameFieldEverywhere(buildRichFile(), "health", "max", "ceiling");
    const steps = JSON.stringify(renamed.verbs[0]?.steps);
    expect(steps).toContain('"field":"capacity.max"');
    expect(steps).toContain("item.capacity.max");
    expect(renamed.components.capacity?.fields.max).toBeDefined();
    expect(findDefinition(renamed, "chest").components.capacity).toEqual({ max: 10 });
  });

  it("renames the world's health field", () => {
    const renamed = renameFieldEverywhere(buildRichFile(), "health", "current", "now");
    expect(renamed.world.agentHealth).toBe("health.now");
    expect(renamed.rules[0]?.steps[0]).toMatchObject({ field: "health.now" });
  });
});

describe("renameDefinitionEverywhere", () => {
  it("reaches matchers, created and transformed items and item fields", () => {
    const renamed = renameDefinitionEverywhere(buildRichFile(), "knife", "blade");
    expect(JSON.stringify(renamed)).not.toContain('"knife"}');
    expect(JSON.stringify(renamed)).not.toMatch(/"(definition|item|into|to|held)":"knife"/);
    expect(renamed.definitions[0]?.id).toBe("blade");
    expect(renamed.components.pocket?.fields.held?.default).toBe("blade");
    expect(findDefinition(renamed, "chest").components.pocket).toEqual({ held: "blade" });
    expect(renamed.verbs[0]?.steps).toContainEqual({
      step: "transform",
      on: "item",
      into: "blade",
    });
    expect(renamed.verbs[0]?.steps).toContainEqual({
      step: "set",
      on: "item",
      field: "pocket.held",
      to: "blade",
    });
  });

  it("renames the agents' body and refuses a taken id", () => {
    const file = buildRichFile();
    expect(renameDefinitionEverywhere(file, "person", "human").world.agentBody).toBe("human");
    expect(renameDefinitionEverywhere(file, "person", "chest")).toBe(file);
  });
});
