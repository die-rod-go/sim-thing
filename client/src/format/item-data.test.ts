import { describe, expect, it } from "vitest";
import { buildThingCatalog, type Entity, type ItemDefinition } from "@village/shared";
import { describeItemData, groupCarriedItems } from "./item-data";

const glyph = { index: 0, color: "#ffffff" };

function makeDefinition(
  id: string,
  components: ItemDefinition["components"],
  plural?: string,
): ItemDefinition {
  return { id, name: id, ...(plural === undefined ? {} : { plural }), glyph, components };
}

const catalog = buildThingCatalog(
  {
    holdable: { description: "Can be carried.", isVisible: false, fields: {} },
    writing: {
      description: "Written.",
      isVisible: false,
      fields: {
        text: { type: "text", description: "Words.", default: "" },
        author: { type: "text", description: "Who.", default: "" },
      },
    },
    health: {
      description: "How much it can take.",
      isVisible: false,
      fields: { current: { type: "number", description: "Now.", min: 0 } },
    },
    breaks_into: {
      description: "What it becomes.",
      isVisible: false,
      fields: { item: { type: "item", description: "The item." } },
    },
  },
  { agentBody: "person", agentHealth: "health.current", lyingWhenOnTile: { has: "holdable" } },
  [
    makeDefinition("coin", { holdable: {} }, "coins"),
    makeDefinition("note", { holdable: {}, writing: {} }, "notes"),
    makeDefinition("shard", {}),
    makeDefinition("jar", { health: { current: 0.6666 }, breaks_into: { item: "shard" } }),
  ],
);

function carried(id: string, definitionId: string, holderId: string, changes = {}): Entity {
  return { id, definitionId, label: null, location: { kind: "inside", holderId }, changes };
}

function writtenBy(author: string, text: string) {
  return { writing: { fields: { author, text }, endsAtTick: null, sourceAgentId: null } };
}

describe("itemData", () => {
  it("counts identical carried items together and leaves out other holders", () => {
    const entities = [
      carried("entity-1", "coin", "ada"),
      carried("entity-2", "coin", "ada"),
      carried("entity-3", "coin", "bob"),
    ];
    expect(groupCarriedItems("ada", entities, catalog).map((group) => group.label)).toEqual([
      "2 coins",
    ]);
  });

  it("gives each note with its own words an entry that shows what it says", () => {
    const entities = [
      carried("entity-1", "note", "ambrose", writtenBy("Ambrose", "Meet me at dawn.")),
      carried("entity-2", "note", "ambrose", writtenBy("Ambrose", "Bread is gone.")),
    ];
    const groups = groupCarriedItems("ambrose", entities, catalog);
    expect(groups.map((group) => group.label)).toEqual(["a note", "a note"]);
    expect(groups[0]?.data).toContainEqual({
      componentName: "writing",
      fields: [
        { fieldName: "text", value: "Meet me at dawn." },
        { fieldName: "author", value: "Ambrose" },
      ],
    });
  });

  it("leaves out empty text, rounds numbers and names items by their definition", () => {
    const blankNote = describeItemData({ writing: { text: "", author: "" } }, catalog);
    expect(blankNote).toEqual([{ componentName: "writing", fields: [] }]);
    const jar = describeItemData(
      { health: { current: 0.6666 }, breaks_into: { item: "shard" } },
      catalog,
    );
    expect(jar).toEqual([
      { componentName: "health", fields: [{ fieldName: "current", value: "0.67" }] },
      { componentName: "breaks_into", fields: [{ fieldName: "item", value: "shard" }] },
    ]);
  });
});
