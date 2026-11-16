import { describe, expect, it } from "vitest";
import type { ItemDefinition, ItemFile } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import { describeItemPreview } from "../../src/item-editor/item-preview";

function buildJarFile(): { file: ItemFile; jar: ItemDefinition } {
  const file = buildTestItemFile({
    components: {
      stock: {
        fields: {
          count: { type: "number", words: [{ below: 1, text: "empty" }, { text: "{value} left" }] },
        },
      },
      cursed: { words: "cursed", isVisible: false },
      shiny: { words: "shiny", isVisible: true },
    },
    definitions: [
      {
        id: "jar",
        name: "jar",
        glyph: { index: 7, color: "#ffffff" },
        components: { stock: { count: 6 }, cursed: {}, shiny: {} },
      },
    ],
    verbs: [
      { name: "take from", appliesTo: { definition: "jar" }, steps: [], phrases: {} },
      { name: "take from", appliesTo: { has: "stock" }, steps: [], phrases: {} },
    ],
  });
  const [jar] = file.definitions;
  if (!jar) throw new Error("no jar");
  return { file, jar };
}

describe("item preview", () => {
  it("shows the visible component words and the number words", () => {
    const { file, jar } = buildJarFile();
    expect(describeItemPreview(file, jar)).toBe("1 jar (take from; shiny, 6 left)");
  });

  it("changes the number words with the value", () => {
    const { file, jar } = buildJarFile();
    const emptied = { ...jar, components: { ...jar.components, stock: { count: 0 } } };
    expect(describeItemPreview(file, emptied)).toContain("empty");
  });

  it("leaves out components agents cannot see", () => {
    const { file, jar } = buildJarFile();
    expect(describeItemPreview(file, jar)).not.toContain("cursed");
  });

  it("lists a verb once however many rules match", () => {
    const { file, jar } = buildJarFile();
    expect(describeItemPreview(file, jar).match(/take from/g)).toHaveLength(1);
  });
});
