import { describe, expect, it } from "vitest";
import type { ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import { describeItemPreview } from "../../src/item-editor/item-preview";
import { createUniqueName, moveWithin } from "../../src/item-editor/list-edits";
import { findDraftProblems, selectEntryProblems } from "../../src/item-editor/problems";
import {
  buildVerbForDefinition,
  countOtherDefinitionsMatched,
  listAppliesToMatches,
  listStimuli,
  listVerbIndexesForDefinition,
} from "../../src/item-editor/verb-edits";

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

  it("moves list entries and numbers taken names", () => {
    expect(moveWithin(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveWithin(["a", "b"], 1, 2)).toEqual(["a", "b"]);
    expect(createUniqueName("new verb", ["new verb"], " ")).toBe("new verb 2");
  });
});
