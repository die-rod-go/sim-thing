import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import {
  addComponentToDefinition,
  addDefinition,
  buildNewDefinition,
  clearComponentField,
  duplicateDefinition,
  removeComponentFromDefinition,
  setComponentField,
} from "../../src/item-editor/definition-edits";

function buildHealthFile() {
  return buildTestItemFile({
    components: {
      health: { fields: { current: { type: "number", default: 0.5 }, max: { type: "number" } } },
    },
    definitions: [],
  });
}

describe("definition edits", () => {
  it("fills only the fields without a default when an item gains a component", () => {
    const file = buildHealthFile();
    const added = addComponentToDefinition(file, buildNewDefinition(file), "health");
    expect(added.components.health).toEqual({ max: 0 });
  });

  it("overrides a field and clears it back to the default", () => {
    const file = buildHealthFile();
    const added = addComponentToDefinition(file, buildNewDefinition(file), "health");
    const overridden = setComponentField(added, "health", "current", 0.9);
    expect(overridden.components.health).toEqual({ max: 0, current: 0.9 });
    expect(clearComponentField(overridden, "health", "current").components.health).toEqual({
      max: 0,
    });
  });

  it("removes a component", () => {
    const file = buildHealthFile();
    const added = addComponentToDefinition(file, buildNewDefinition(file), "health");
    expect(removeComponentFromDefinition(added, "health").components).toEqual({});
  });

  it("gives a new item a unique id and no components", () => {
    const file = addDefinition(addDefinition(buildTestItemFile()));
    const ids = file.definitions.map((definition) => definition.id);
    expect(ids.slice(-2)).toEqual(["new_item", "new_item_2"]);
    expect(buildNewDefinition(file).components).toEqual({});
  });

  it("gives a duplicate a unique id", () => {
    const file = buildTestItemFile();
    expect(duplicateDefinition(file, 0).definitions[1]?.id).toBe("knife_2");
  });
});
