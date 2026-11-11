import { describe, expect, it } from "vitest";
import type { ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/src/items/test-item-file";
import { renameComponentField, setComponentFieldType } from "./declaration-edits";
import {
  addComponentToDefinition,
  addDefinition,
  buildNewDefinition,
  duplicateDefinition,
} from "./definition-edits";
import { describeItemPreview } from "./item-preview";
import { createUniqueName, moveWithin } from "./list-edits";
import { findDraftProblems, selectEntryProblems } from "./problems";
import { changeMatcherKind } from "./rule-edits";
import { listComponentUses } from "./usage";
import { parseStepsText } from "./step-edits";
import { switchNumberValueMode } from "./value-modes";
import {
  buildVerbForDefinition,
  countOtherDefinitionsMatched,
  listReadablePaths,
  listAppliesToMatches,
  listStimuli,
  listVerbIndexesForDefinition,
} from "./verb-edits";

const noReferences = { references: [] };

function findDefinition(file: ItemFile, id: string) {
  const definition = file.definitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`no ${id} in the test file`);
  return definition;
}

describe("item editor edits", () => {
  it("creates a held verb for something holdable and a plain one for a placed item", () => {
    const file = buildTestItemFile();
    expect(buildVerbForDefinition(file, findDefinition(file, "knife")).appliesTo).toEqual({
      allOf: [{ definition: "knife" }, { where: "held" }],
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
    expect(listAppliesToMatches(file, { has: "holdable" })).toContain("knife (held)");
  });

  it("offers only fields of components the matcher guarantees, and none when bare-handed", () => {
    const file = buildTestItemFile();
    const matcher = { anyOf: [{ definition: "knife" }, { definition: "bread" }] };
    expect(listReadablePaths(file, matcher, "number")).toEqual(["item.holdable.kilograms"]);
    expect(listReadablePaths(file, { has: "weapon" }, "range")).toEqual(["item.weapon.damage"]);
    expect(listReadablePaths(file, undefined, "number")).toEqual([]);
  });

  it("keeps a literal and a factor when a number switches between literal, read and roll", () => {
    const read = switchNumberValueMode(
      { min: 3, max: 4, times: "item.holdable.kilograms" },
      "from",
      "item.weapon.damage",
    );
    expect(read).toEqual({ from: "item.weapon.damage", times: "item.holdable.kilograms" });
    expect(switchNumberValueMode(3, "roll", "")).toEqual({ min: 3, max: 3 });
    expect(switchNumberValueMode({ min: 3, max: 4 }, "literal", "")).toBe(3);
  });

  it("gives a new item a unique id and no components", () => {
    const file = addDefinition(addDefinition(buildTestItemFile()));
    const ids = file.definitions.map((definition) => definition.id);
    expect(ids.slice(-2)).toEqual(["new_item", "new_item_2"]);
    expect(buildNewDefinition(file).components).toEqual({});
    expect(duplicateDefinition(file, 0).definitions[1]?.id).toBe("knife_2");
  });

  it("carries a renamed or retyped component field over to the items that have it", () => {
    const renamed = renameComponentField(buildTestItemFile(), "holdable", "kilograms", "grams");
    expect(findDefinition(renamed, "knife").components.holdable).toEqual({ grams: 0.3 });
    const retyped = setComponentFieldType(renamed, "holdable", "grams", "boolean");
    expect(findDefinition(retyped, "knife").components.holdable).toEqual({ grams: false });
  });

  it("applies valid steps text and rejects invalid text saying why", () => {
    expect(parseStepsText('[{"step":"destroy","on":"item"}]').steps).toHaveLength(1);
    const unknown = parseStepsText('[{"step":"explode"}]');
    expect(unknown.steps).toBeNull();
    expect(unknown.error).toContain("0");
    expect(parseStepsText("[").steps).toBeNull();
  });

  it("lists every stimulus the file uses", () => {
    const file = buildTestItemFile({
      rules: [{ trigger: "stimulus", stimulus: "fire", if: { has: "metal" }, steps: [] }],
      verbs: [
        { name: "light", steps: [{ step: "send", on: "target", stimulus: "heat" }], phrases: {} },
      ],
    });
    expect(listStimuli(file)).toEqual(["fire", "heat"]);
  });

  it("previews an item as a prompt lists it", () => {
    const file = buildTestItemFile();
    expect(describeItemPreview(file, findDefinition(file, "bread"))).toBe("1 bread (eat)");
    expect(describeItemPreview(file, findDefinition(file, "oven"))).toBe("1 oven (bake bread)");
  });

  it("finds where a component is used, including in a rule's matcher", () => {
    const file = buildTestItemFile({
      rules: [
        { trigger: "stimulus", stimulus: "fire", if: { allOf: [{ has: "metal" }] }, steps: [] },
      ],
    });
    expect(listComponentUses(file, "metal")).toEqual([
      "item knife",
      "item coin",
      "rule stimulus fire",
    ]);
  });

  it("starts a field at its declared default when an item gains the component", () => {
    const file = buildTestItemFile({
      components: {
        health: { fields: { current: { type: "number", default: 0.5 }, max: { type: "number" } } },
      },
      definitions: [],
    });
    const added = addComponentToDefinition(file, buildNewDefinition(file), "health");
    expect(added.components.health).toEqual({ current: 0.5, max: 0 });
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
      references: [{ definitionId: "oven", usedBy: "map object oven" }],
    });
    expect(problems.some((problem) => problem.message.includes("map object oven"))).toBe(true);
  });

  it("keeps a group's parts when it switches between all of and any of", () => {
    const file = buildTestItemFile();
    expect(changeMatcherKind({ allOf: [{ where: "held" }] }, "anyOf", file)).toEqual({
      anyOf: [{ where: "held" }],
    });
  });

  it("moves list entries and numbers taken names", () => {
    expect(moveWithin(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveWithin(["a", "b"], 1, 2)).toEqual(["a", "b"]);
    expect(createUniqueName("new verb", ["new verb"], " ")).toBe("new verb 2");
  });
});
