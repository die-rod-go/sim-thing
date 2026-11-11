import { describe, expect, it } from "vitest";
import { effectSchema, type ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/src/items/test-item-file";
import { renameComponentField, setComponentFieldType } from "./declaration-edits";
import { addDefinition, buildNewDefinition, duplicateDefinition } from "./definition-edits";
import { buildEffect, EFFECT_FIELD_SPECS, setEffectField } from "./effect-fields";
import { describeItemPreview } from "./item-preview";
import { createUniqueName, moveWithin } from "./list-edits";
import { findDraftProblems, selectEntryProblems } from "./problems";
import { changeRuleKind } from "./rule-edits";
import { listPropertyUses } from "./usage";
import { switchNumberValueMode, switchRangeValueMode } from "./value-modes";
import {
  buildVerbForDefinition,
  countOtherDefinitionsMatched,
  listReadablePaths,
  listRuleMatches,
  listStimuli,
  listVerbIndexesForDefinition,
} from "./verb-edits";

const noReferences = { references: [], currencyDefinitionId: "coin" };

function findDefinition(file: ItemFile, id: string) {
  const definition = file.definitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`no ${id} in the test file`);
  return definition;
}

describe("item editor edits", () => {
  it("creates a held verb for a carriable and a plain one for a placeable", () => {
    const file = buildTestItemFile();
    expect(buildVerbForDefinition(file, findDefinition(file, "knife")).appliesTo).toEqual({
      allOf: [{ definition: "knife" }, { location: "held" }],
    });
    expect(buildVerbForDefinition(file, findDefinition(file, "oven")).appliesTo).toEqual({
      definition: "oven",
    });
  });

  it("lists the verbs matching an item and how many other items each also matches", () => {
    const file = buildTestItemFile();
    const bread = findDefinition(file, "bread");
    expect(listVerbIndexesForDefinition(file, bread)).toEqual([0]);
    const eat = file.verbs[0];
    if (!eat) throw new Error("no eat verb");
    expect(countOtherDefinitionsMatched(file, eat, "bread")).toBe(0);
    expect(listRuleMatches(file, { component: "weight" })).toContain("knife (held)");
  });

  it("offers only fields of components the rule guarantees", () => {
    const file = buildTestItemFile();
    const rule = { anyOf: [{ definition: "knife" }, { definition: "bread" }] };
    expect(listReadablePaths(file, rule, "number")).toEqual(["item.weight.kilograms"]);
    expect(listReadablePaths(file, { component: "weapon" }, "range")).toEqual([
      "item.weapon.damage",
    ]);
  });

  it("keeps a literal when a number switches to a component read and back", () => {
    const times = switchNumberValueMode(3, "times", "item.weight.kilograms");
    expect(times).toEqual({ value: 3, times: "item.weight.kilograms" });
    expect(switchNumberValueMode(times, "literal", "")).toBe(3);
    expect(
      switchRangeValueMode({ min: 1, max: 2 }, "from", {
        rangePath: "item.weapon.damage",
        numberPath: "",
      }),
    ).toEqual({ from: "item.weapon.damage" });
  });

  it("gives a new item a unique id and the weight every carriable needs", () => {
    const file = addDefinition(addDefinition(buildTestItemFile()));
    const ids = file.definitions.map((definition) => definition.id);
    expect(ids.slice(-2)).toEqual(["new_item", "new_item_2"]);
    expect(buildNewDefinition(file).components).toEqual({ weight: { kilograms: 0 } });
    expect(duplicateDefinition(file, 0).definitions[1]?.id).toBe("knife_2");
  });

  it("carries a renamed or retyped component field over to the items that have it", () => {
    const renamed = renameComponentField(buildTestItemFile(), "weight", "kilograms", "grams");
    expect(findDefinition(renamed, "knife").components.weight).toEqual({ grams: 0.3 });
    const retyped = setComponentFieldType(renamed, "weight", "grams", "boolean");
    expect(findDefinition(retyped, "knife").components.weight).toEqual({ grams: false });
  });

  it("builds effects that pass the schema and drops a field set to undefined", () => {
    const file = buildTestItemFile();
    const damage = buildEffect("damage", "verb", file, ["cut"]);
    expect(damage).toMatchObject({ type: "damage", on: "user", amount: { min: 0, max: 0 } });
    expect(setEffectField(damage, "on", undefined)).not.toHaveProperty("on");
    expect(buildEffect("emit", "reaction", file, [])).not.toHaveProperty("on");
  });

  it("knows every field each effect type takes", () => {
    const modifiers = ["type", "on", "chance", "when", "requiresHit", "radius"];
    for (const option of effectSchema.options) {
      const keys = Object.keys(option.shape).filter((key) => !modifiers.includes(key));
      const type = option.shape.type.value;
      expect(EFFECT_FIELD_SPECS[type].map((spec) => spec.key).sort()).toEqual(keys.sort());
    }
  });

  it("lists every stimulus the file uses", () => {
    const file = buildTestItemFile({
      reactions: [{ stimulus: "fire", property: "metal", effects: [] }],
    });
    expect(listStimuli(file)).toEqual(["fire"]);
  });

  it("previews an item as a prompt lists it", () => {
    const file = buildTestItemFile();
    expect(describeItemPreview(file, findDefinition(file, "bread"))).toBe("1 bread (eat)");
    expect(describeItemPreview(file, findDefinition(file, "oven"))).toBe("1 oven (bake bread)");
  });

  it("finds where a property is used", () => {
    expect(listPropertyUses(buildTestItemFile(), "metal")).toEqual(["item knife", "item coin"]);
  });

  it("reports shape errors under the entry they belong to", () => {
    const file = buildTestItemFile();
    const broken = { ...file, verbs: [{ ...file.verbs[0], name: "" }] } as ItemFile;
    const problems = findDraftProblems(broken, noReferences);
    expect(selectEntryProblems(problems, broken, "verbs", 0).length).toBeGreaterThan(0);
  });

  it("flags deleting a definition the map still places", () => {
    const file = buildTestItemFile();
    const withoutOven = {
      ...file,
      definitions: file.definitions.filter((definition) => definition.id !== "oven"),
    };
    const problems = findDraftProblems(withoutOven, {
      ...noReferences,
      references: [{ definitionId: "oven", requiredForm: "placeable", usedBy: "map object oven" }],
    });
    expect(problems.some((problem) => problem.message.includes("map object oven"))).toBe(true);
  });

  it("keeps a group's parts when it switches between all of and any of", () => {
    const file = buildTestItemFile();
    expect(changeRuleKind({ allOf: [{ isUser: true }] }, "anyOf", file)).toEqual({
      anyOf: [{ isUser: true }],
    });
  });

  it("moves list entries and numbers taken names", () => {
    expect(moveWithin(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveWithin(["a", "b"], 1, 2)).toEqual(["a", "b"]);
    expect(createUniqueName("new verb", ["new verb"], " ")).toBe("new verb 2");
  });
});
