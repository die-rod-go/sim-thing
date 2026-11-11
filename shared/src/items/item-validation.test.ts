import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "./test-item-file";
import { attack, messagesFor, withVerbs } from "./validation-test-kit";

describe("item file validation", () => {
  it("finds nothing wrong with a sound file", () => {
    expect(messagesFor(buildTestItemFile())).toEqual([]);
  });

  it("accepts an attack verb reading its weapon", () => {
    expect(messagesFor(withVerbs(attack))).toEqual([]);
  });

  it("rejects two same-named verbs that match the same thing", () => {
    const messages = messagesFor(
      withVerbs({ name: "eat", appliesTo: { has: "food" }, effects: [] }),
    );
    expect(messages.some((message) => message.includes('Another "eat" verb'))).toBe(true);
  });

  it("allows same-named verbs once one appliesTo excludes the other's items", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      verbs: [
        {
          name: "throw",
          appliesTo: { allOf: [{ where: "held" }, { not: { definition: "knife" } }] },
          effects: [],
        },
        {
          name: "throw",
          appliesTo: { allOf: [{ where: "held" }, { definition: "knife" }] },
          effects: [],
        },
        ...base.verbs,
      ],
    });
    expect(messagesFor(file).filter((message) => message.includes("throw"))).toEqual([]);
  });

  it("warns about an appliesTo that matches nothing", () => {
    const messages = messagesFor(
      withVerbs({
        name: "polish",
        appliesTo: { allOf: [{ definition: "oven" }, { where: "held" }] },
        effects: [],
      }),
    );
    expect(messages).toContain("warning: verbs.2 (polish).appliesTo: appliesTo matches nothing.");
  });

  it("rejects reading a component appliesTo doesn't guarantee", () => {
    const messages = messagesFor(
      withVerbs({
        ...attack,
        appliesTo: { anyOf: [{ has: "weapon" }, { has: "food" }] },
        target: "none",
        effects: [{ type: "damage", on: "user", amount: { from: "item.weapon.damage" } }],
      }),
    );
    expect(messages.some((message) => message.includes("doesn't require the weapon"))).toBe(true);
  });

  it("rejects reading a field with the wrong type", () => {
    const messages = messagesFor(
      withVerbs({ ...attack, hitRoll: { baseHitChance: { from: "item.weapon.damage" } } }),
    );
    expect(messages.some((message) => message.includes("weapon.damage is a range"))).toBe(true);
  });

  it("rejects an aimed verb that isn't held or bare-handed", () => {
    const messages = messagesFor(withVerbs({ ...attack, appliesTo: { has: "weapon" } }));
    expect(messages.some((message) => message.includes("An aimed verb's appliesTo"))).toBe(true);
  });

  it("rejects on: item in a bare-handed verb", () => {
    const messages = messagesFor(
      withVerbs({
        name: "punch",
        effects: [{ type: "destroy", on: "item" }],
      }),
    );
    expect(messages.some((message) => message.includes("there's no item"))).toBe(true);
  });

  it("rejects a start effect that requires a hit", () => {
    const messages = messagesFor(
      withVerbs({
        ...attack,
        effects: [{ type: "destroy", on: "target", when: "start", requiresHit: true }],
        phrases: { hit: "hit", missed: "missed" },
      }),
    );
    expect(messages.some((message) => message.includes("can't require a hit"))).toBe(true);
  });

  it("rejects a damaging verb without a killed phrase", () => {
    const messages = messagesFor(
      withVerbs({ ...attack, phrases: { hit: "hit", missed: "missed" } }),
    );
    expect(messages.some((message) => message.includes("needs a `killed` phrase"))).toBe(true);
  });

  it("rejects unknown components and items in effects", () => {
    const messages = messagesFor(
      withVerbs({
        name: "curse",
        appliesTo: { definition: "oven" },
        effects: [
          { type: "add_condition", on: "user", condition: "cursed" },
          { type: "produce", on: "user", item: "gold", count: 1, into: "user" },
        ],
      }),
    );
    expect(messages).toContain('error: verbs.2 (curse).effects.0: Unknown component "cursed".');
    expect(messages).toContain('error: verbs.2 (curse).effects.1: Unknown item "gold".');
  });

  it("rejects a field value of the wrong type or outside its literal bounds", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      definitions: [
        ...base.definitions,
        {
          id: "feather",
          name: "feather",
          glyph: { index: 9, color: "#ffffff" },
          components: { holdable: { kilograms: -1 }, food: { hunger: "a lot" } },
        },
      ],
    });
    const messages = messagesFor(file);
    expect(messages).toContain(
      "error: definitions.6 (feather).components.holdable.kilograms: Is outside the field's `min` and `max`.",
    );
    expect(messages).toContain(
      "error: definitions.6 (feather).components.food.hunger: Must be a number.",
    );
  });

  it("rejects a missing field unless its declaration has a default", () => {
    const base = buildTestItemFile();
    const withGap = (kilograms: unknown) =>
      buildTestItemFile({
        components: { ...base.components, holdable: { fields: { kilograms } } },
        definitions: [
          ...base.definitions,
          {
            id: "feather",
            name: "feather",
            glyph: { index: 9, color: "#ffffff" },
            components: { holdable: {} },
          },
        ],
      });
    expect(messagesFor(withGap({ type: "number" }))).toContain(
      'error: definitions.6 (feather).components.holdable: Missing field "kilograms".',
    );
    expect(messagesFor(withGap({ type: "number", default: 0.1 }))).toEqual([]);
  });

  it("rejects an item field naming no definition", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      components: { ...base.components, breaks_into: { fields: { item: { type: "item" } } } },
      definitions: base.definitions.map((definition) =>
        definition.id === "knife"
          ? {
              ...definition,
              components: { ...definition.components, breaks_into: { item: "dust" } },
            }
          : definition,
      ),
    });
    expect(messagesFor(file)).toContain(
      'error: definitions.0 (knife).components.breaks_into.item: Unknown item "dust".',
    );
  });

  it("rejects a min or max naming something that isn't a number field of the component", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      components: {
        ...base.components,
        capacity: { fields: { max: { type: "number", min: "least" } } },
      },
    });
    expect(messagesFor(file)).toContain(
      'error: components.capacity.max: `min` names "least", which isn\'t a number field here.',
    );
  });

  it("rejects world settings naming no body, no health field or unknown components", () => {
    const base = buildTestItemFile();
    const withWorld = (world: Record<string, unknown>) =>
      messagesFor(buildTestItemFile({ world: { ...base.world, ...world } }));
    expect(withWorld({ agentBody: "ghost" })).toContain(
      'error: world.agentBody: "ghost" has no definition.',
    );
    expect(withWorld({ agentHealth: "weapon.hitChance" })).toContain(
      'error: world.agentHealth: "weapon.hitChance" must be a number field of a component person has.',
    );
    expect(withWorld({ sightBlockedBy: { has: "fog" } })).toContain(
      'error: world.sightBlockedBy: Unknown component "fog".',
    );
    expect(withWorld({ sightBlockedBy: { where: "held" } })).toContain(
      "error: world.sightBlockedBy: `where` only works in a verb's appliesTo: there is no user here.",
    );
  });

  it("warns when something could make or destroy what the closed supply matches", () => {
    const messages = messagesFor(
      withVerbs({
        name: "mint",
        appliesTo: { definition: "oven" },
        effects: [{ type: "produce", on: "user", item: "coin", count: 1, into: "user" }],
      }),
    );
    expect(messages).toContain(
      "warning: verbs.2 (mint).effects.0: Makes coin, so the supply isn't closed.",
    );
  });

  it("rejects map and seed references to unknown definitions and to the agents' body", () => {
    const messages = messagesFor(buildTestItemFile(), {
      references: [
        { definitionId: "anvil", usedBy: "map object smithy anvil" },
        { definitionId: "person", usedBy: "seed agent mara" },
        { definitionId: "knife", usedBy: "map object kitchen knife" },
      ],
    });
    expect(messages).toEqual([
      'error: definitions: map object smithy anvil uses "anvil", which has no definition.',
      "error: definitions (person): seed agent mara uses \"person\", the agents' body, which can't be placed or carried.",
    ]);
  });
});
