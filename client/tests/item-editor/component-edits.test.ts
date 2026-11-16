import { describe, expect, it } from "vitest";
import type { ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import {
  addComponentField,
  addFieldWord,
  changeFieldWord,
  listSiblingNumberFields,
  moveFieldWord,
  removeComponentDeclaration,
  removeComponentField,
  removeFieldWord,
  setComponentFieldType,
  setFieldBound,
  setFieldDefault,
  setFieldWords,
} from "../../src/item-editor/component-edits";
import { renameFieldEverywhere } from "../../src/item-editor/rename-edits";
import { listComponentUses } from "../../src/item-editor/usage";

function findDefinition(file: ItemFile, id: string) {
  const definition = file.definitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`no ${id} in the test file`);
  return definition;
}

describe("component field edits", () => {
  it("carries a renamed or retyped component field over to the items that have it", () => {
    const renamed = renameFieldEverywhere(buildTestItemFile(), "holdable", "kilograms", "grams");
    expect(findDefinition(renamed, "knife").components.holdable).toEqual({ grams: 0.3 });
    const retyped = setComponentFieldType(renamed, "holdable", "grams", "boolean");
    expect(findDefinition(retyped, "knife").components.holdable).toEqual({ grams: false });
  });

  it("drops number-only options and a mismatched default when the type changes", () => {
    let file = setFieldDefault(buildTestItemFile(), "health", "max", 4);
    file = setFieldWords(file, "health", "max", [{ text: "tough" }]);
    const retyped = setComponentFieldType(file, "health", "max", "text");
    expect(retyped.components.health?.fields.max).toEqual({ type: "text", description: "" });
    expect(findDefinition(retyped, "oven").components.health?.max).toBe("");
  });

  it("keeps a default of the new type and gives items that starting value", () => {
    const file = setFieldDefault(buildTestItemFile(), "weapon", "stimulus", "cut");
    const retyped = setComponentFieldType(file, "weapon", "stimulus", "item");
    expect(retyped.components.weapon?.fields.stimulus?.default).toBe("cut");
    expect(findDefinition(retyped, "knife").components.weapon?.stimulus).toBe("cut");
  });

  it("clears a bound naming a field that stops being a number or is removed", () => {
    const file = buildTestItemFile();
    const retyped = setComponentFieldType(file, "health", "max", "boolean");
    expect(retyped.components.health?.fields.current?.max).toBeUndefined();
    const removed = removeComponentField(file, "health", "max");
    expect(removed.components.health?.fields.current?.max).toBeUndefined();
    expect(findDefinition(removed, "oven").components.health).toEqual({ current: 6 });
  });

  it("gives items a starting value for a new field", () => {
    const added = addComponentField(buildTestItemFile(), "holdable");
    expect(findDefinition(added, "knife").components.holdable).toEqual({
      kilograms: 0.3,
      newField: 0,
    });
  });

  it("removes only the declaration when a component is removed", () => {
    const removed = removeComponentDeclaration(buildTestItemFile(), "metal");
    expect(removed.components.metal).toBeUndefined();
    expect(findDefinition(removed, "knife").components.metal).toEqual({});
  });

  it("sets bounds as a number or a sibling field and clears them", () => {
    const literal = setFieldBound(buildTestItemFile(), "health", "current", "min", 0.2);
    expect(literal.components.health?.fields.current?.min).toBe(0.2);
    const sibling = setFieldBound(literal, "health", "current", "max", "max");
    expect(sibling.components.health?.fields.current?.max).toBe("max");
    const cleared = setFieldBound(sibling, "health", "current", "min", undefined);
    expect(cleared.components.health?.fields.current).not.toHaveProperty("min");
  });

  it("lists the other number fields of the component as bound choices", () => {
    const { health, weapon } = buildTestItemFile().components;
    if (!health || !weapon) throw new Error("missing components");
    expect(listSiblingNumberFields(weapon, "hitChance")).toEqual([]);
    expect(listSiblingNumberFields(health, "current")).toEqual(["max"]);
  });

  it("stores an empty words list as none", () => {
    const words = setFieldWords(buildTestItemFile(), "health", "max", addFieldWord(undefined));
    expect(words.components.health?.fields.max?.words).toEqual([{ text: "words" }]);
    const emptied = setFieldWords(words, "health", "max", []);
    expect(emptied.components.health?.fields.max).not.toHaveProperty("words");
  });

  it("edits, moves and removes one words entry", () => {
    const entries = [{ below: 1, text: "low" }, { text: "fine" }];
    expect(changeFieldWord(entries, 0, { below: undefined })).toEqual([
      { text: "low" },
      { text: "fine" },
    ]);
    expect(changeFieldWord(entries, 1, { text: "ok" })[1]).toEqual({ text: "ok" });
    expect(moveFieldWord(entries, 1, -1)[0]).toEqual({ text: "fine" });
    expect(moveFieldWord(entries, 0, -1)).toEqual(entries);
    expect(removeFieldWord(entries, 0)).toEqual([{ text: "fine" }]);
  });
});

describe("listComponentUses", () => {
  it("finds items, verbs and rules, including a rule's matcher", () => {
    const file = buildTestItemFile({
      rules: [
        { trigger: "stimulus", stimulus: "fire", if: { allOf: [{ has: "metal" }] }, steps: [] },
      ],
    });
    expect(listComponentUses(file, "metal")).toEqual([
      { kind: "item", index: 0, label: "knife" },
      { kind: "item", index: 2, label: "coin" },
      { kind: "rule", index: 0, label: "stimulus fire" },
    ]);
  });

  it("finds a verb that only reads a field of the component", () => {
    const readOnly = buildTestItemFile({
      verbs: [
        {
          name: "count",
          steps: [{ step: "wait", minutes: { from: "user.holdable.kilograms" } }],
          phrases: {},
        },
      ],
    });
    expect(listComponentUses(readOnly, "holdable")).toContainEqual({
      kind: "verb",
      index: 0,
      label: "count",
    });
  });
});
