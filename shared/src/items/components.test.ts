import { describe, expect, it } from "vitest";
import { buildItemCatalog, findDefinition, readAgentHealth } from "./catalog";
import {
  addComponentChange,
  listComponentWords,
  removeComponentChange,
  resolveComponents,
  writeFieldChange,
  type ComponentChanges,
  type ComponentInstance,
} from "./components";
import { buildTestItemFile } from "./test-item-file";

const base = buildTestItemFile();
const file = buildTestItemFile({
  components: {
    ...base.components,
    burning: { words: "on fire", isVisible: true },
    poisoned: { words: "poisoned" },
    stock: {
      fields: {
        capacity: { type: "number", min: 0 },
        amount: {
          type: "number",
          min: 0,
          max: "capacity",
          default: 4,
          words: [{ below: 1, text: "empty" }, { text: "{value} left" }],
        },
      },
    },
    turns_into: {
      fields: {
        item: { type: "item" },
        hoursLeft: {
          type: "number",
          words: [{ text: "turns into {item} in {value} h" }],
        },
      },
    },
  },
  definitions: [
    ...base.definitions,
    {
      id: "field",
      name: "field",
      glyph: { index: 7, color: "#ffffff" },
      components: { stock: { capacity: 12 } },
    },
  ],
});
const catalog = buildItemCatalog(file);
const declarations = file.components;
const oven = findDefinition(catalog, "oven");
const field = findDefinition(catalog, "field");

function instance(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
  return { fields: {}, endsAtTick: null, sourceAgentId: null, ...overrides };
}

describe("resolving components", () => {
  it("takes them from the definition, filling a missing field from its default", () => {
    expect(resolveComponents(declarations, oven, {})).toEqual({ health: { max: 6, current: 6 } });
    expect(resolveComponents(declarations, field, {}).stock).toEqual({ capacity: 12, amount: 4 });
  });

  it("overrides the fields a change lists and keeps the rest", () => {
    const changes = { health: instance({ fields: { current: 2 } }) };
    expect(resolveComponents(declarations, oven, changes).health).toEqual({ max: 6, current: 2 });
  });

  it("drops a component whose change is null", () => {
    expect(resolveComponents(declarations, oven, { health: null })).toEqual({});
  });

  it("adds a component the definition lacks, with its defaults", () => {
    const resolved = resolveComponents(declarations, oven, {
      burning: instance({ endsAtTick: 30 }),
      stock: instance({ fields: { capacity: 3 } }),
    });
    expect(resolved.burning).toEqual({});
    expect(resolved.stock).toEqual({ capacity: 3, amount: 4 });
  });
});

describe("writing a field", () => {
  const path = { component: "health", field: "current" };

  it("stores a value that differs from the definition's", () => {
    const changes = writeFieldChange(declarations, oven, {}, path, 2.5);
    expect(changes).toEqual({ health: instance({ fields: { current: 2.5 } }) });
  });

  it("clamps to a literal bound", () => {
    const changes = writeFieldChange(declarations, oven, {}, path, -3);
    expect(resolveComponents(declarations, oven, changes).health?.current).toBe(0);
  });

  it("clamps to a sibling field, as that field is now", () => {
    const lowered = writeFieldChange(declarations, oven, {}, { ...path, field: "max" }, 4);
    const hurt = writeFieldChange(declarations, oven, lowered, path, 1);
    const healed = writeFieldChange(declarations, oven, hurt, path, 9);
    expect(resolveComponents(declarations, oven, healed).health).toEqual({ max: 4, current: 4 });
  });

  it("drops an entry that matches the definition again", () => {
    const hurt = writeFieldChange(declarations, oven, {}, path, 2);
    expect(writeFieldChange(declarations, oven, hurt, path, 6)).toEqual({});
  });

  it("does nothing to a thing that lacks the component", () => {
    const changes: ComponentChanges = {};
    const written = writeFieldChange(
      declarations,
      oven,
      changes,
      {
        component: "stock",
        field: "amount",
      },
      1,
    );
    expect(written).toBe(changes);
  });
});

describe("adding and removing a component", () => {
  it("adds one the thing lacks", () => {
    const added = addComponentChange(
      declarations,
      oven,
      {},
      "burning",
      instance({ endsAtTick: 31 }),
    );
    expect(added.isNew).toBe(true);
    expect(added.changes.burning).toEqual(instance({ endsAtTick: 31 }));
  });

  it("extends a timed one to the later end and takes the newer source", () => {
    const first = addComponentChange(
      declarations,
      oven,
      {},
      "burning",
      instance({ endsAtTick: 31, sourceAgentId: "mara" }),
    );
    const longer = addComponentChange(
      declarations,
      oven,
      first.changes,
      "burning",
      instance({ endsAtTick: 40, sourceAgentId: "tobias" }),
    );
    const shorter = addComponentChange(
      declarations,
      oven,
      longer.changes,
      "burning",
      instance({ endsAtTick: 35 }),
    );
    expect(longer.isNew).toBe(false);
    expect(longer.changes.burning).toEqual(instance({ endsAtTick: 40, sourceAgentId: "tobias" }));
    expect(shorter.changes.burning).toEqual(instance({ endsAtTick: 40, sourceAgentId: "tobias" }));
  });

  it("lets no end beat any end", () => {
    const timed = addComponentChange(
      declarations,
      oven,
      {},
      "burning",
      instance({ endsAtTick: 31 }),
    );
    const lasting = addComponentChange(declarations, oven, timed.changes, "burning", instance());
    const again = addComponentChange(
      declarations,
      oven,
      lasting.changes,
      "burning",
      instance({ endsAtTick: 99 }),
    );
    expect(again.changes.burning?.endsAtTick).toBeNull();
  });

  it("stores null for a removed component the definition has, and nothing for an added one", () => {
    const burning = addComponentChange(declarations, oven, {}, "burning", instance()).changes;
    expect(removeComponentChange(oven, burning, "burning")).toEqual({});
    expect(removeComponentChange(oven, {}, "health")).toEqual({ health: null });
  });

  it("puts back a removed component of the definition with no entry left", () => {
    const removed = removeComponentChange(oven, {}, "health");
    const restored = addComponentChange(declarations, oven, removed, "health", instance());
    expect(restored.isNew).toBe(true);
    expect(restored.changes).toEqual({});
  });
});

describe("an agent's body", () => {
  it("reads health from the field the world settings name", () => {
    expect(readAgentHealth(catalog, { bodyChanges: {} })).toBe(1);
    const hurt = { health: instance({ fields: { current: 0.4 } }) };
    expect(readAgentHealth(catalog, { bodyChanges: hurt })).toBe(0.4);
  });
});

describe("component words", () => {
  it("lists component words in declaration order, then number field words", () => {
    const components = resolveComponents(declarations, field, {
      poisoned: instance(),
      burning: instance(),
    });
    expect(listComponentWords(declarations, components, false)).toEqual([
      "on fire",
      "poisoned",
      "4 left",
    ]);
  });

  it("leaves out what others can't see", () => {
    const components = resolveComponents(declarations, oven, {
      poisoned: instance(),
      burning: instance(),
    });
    expect(listComponentWords(declarations, components, true)).toEqual(["on fire"]);
  });

  it("picks the first field word the value is under, rounding the value down", () => {
    const empty = resolveComponents(declarations, field, {
      stock: instance({ fields: { amount: 0.5 } }),
    });
    const some = resolveComponents(declarations, field, {
      stock: instance({ fields: { amount: 6.9 } }),
    });
    expect(listComponentWords(declarations, empty, true)).toEqual(["empty"]);
    expect(listComponentWords(declarations, some, true)).toEqual(["6 left"]);
  });

  it("fills a field word with another field of the component, an item read as its name", () => {
    const turning = resolveComponents(declarations, oven, {
      turns_into: instance({ fields: { item: "oven", hoursLeft: 40.7 } }),
    });
    expect(
      listComponentWords(declarations, turning, true, (definitionId) => `the ${definitionId}`),
    ).toEqual(["turns into the oven in 40 h"]);
  });
});
