import { describe, expect, it } from "vitest";
import type { ItemFile } from "./item-file";
import { findItemFileProblems } from "./item-validation";
import { buildTestItemFile } from "./test-item-file";

function messagesFor(file: ItemFile, options: Parameters<typeof findItemFileProblems>[1] = {}) {
  return findItemFileProblems(file, options).map(
    (problem) => `${problem.severity}: ${problem.path}: ${problem.message}`,
  );
}

function withVerbs(...verbs: unknown[]): ItemFile {
  const base = buildTestItemFile();
  return buildTestItemFile({ verbs: [...base.verbs, ...verbs] });
}

const attack = {
  name: "attack",
  appliesTo: { allOf: [{ component: "weapon" }, { location: "held" }] },
  target: "agent_or_entity",
  hitRoll: { baseHitChance: { from: "item.weapon.hitChance" } },
  effects: [
    {
      type: "damage",
      on: "target",
      amount: { from: "item.weapon.damage" },
      stimulus: { from: "item.weapon.stimulus" },
    },
  ],
  phrases: { hit: "hit {target}", missed: "missed {target}", killed: "stabbed by {actor}" },
};

describe("item file validation", () => {
  it("finds nothing wrong with a sound file", () => {
    expect(messagesFor(buildTestItemFile(), { currencyDefinitionId: "coin" })).toEqual([]);
  });

  it("accepts an attack verb reading its weapon", () => {
    expect(messagesFor(withVerbs(attack))).toEqual([]);
  });

  it("rejects two same-named verbs that match the same thing", () => {
    const messages = messagesFor(
      withVerbs({ name: "eat", appliesTo: { component: "food" }, effects: [] }),
    );
    expect(messages.some((message) => message.includes('Another "eat" verb'))).toBe(true);
  });

  it("allows same-named verbs once one rule excludes the other's items", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      verbs: [
        {
          name: "throw",
          appliesTo: { allOf: [{ location: "held" }, { not: { definition: "knife" } }] },
          effects: [],
        },
        {
          name: "throw",
          appliesTo: { allOf: [{ location: "held" }, { definition: "knife" }] },
          effects: [],
        },
        ...base.verbs,
      ],
    });
    expect(messagesFor(file).filter((message) => message.includes("throw"))).toEqual([]);
  });

  it("rejects a rule that matches other living agents", () => {
    const messages = messagesFor(
      withVerbs({ name: "poke", appliesTo: { not: { component: "food" } }, effects: [] }),
    );
    expect(messages.some((message) => message.includes("matches other living agents"))).toBe(true);
  });

  it("warns about a rule that matches nothing", () => {
    const messages = messagesFor(
      withVerbs({
        name: "polish",
        appliesTo: { allOf: [{ definition: "oven" }, { location: "held" }] },
        effects: [],
      }),
    );
    expect(messages).toContain("warning: verbs.2 (polish).appliesTo: appliesTo matches nothing.");
  });

  it("rejects reading a component the rule doesn't guarantee", () => {
    const messages = messagesFor(
      withVerbs({
        ...attack,
        appliesTo: { anyOf: [{ component: "weapon" }, { component: "food" }] },
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

  it("rejects an aimed verb whose rule isn't held or the user", () => {
    const messages = messagesFor(withVerbs({ ...attack, appliesTo: { component: "weapon" } }));
    expect(messages.some((message) => message.includes("An aimed verb's rule"))).toBe(true);
  });

  it("rejects on: item in a bare-handed verb", () => {
    const messages = messagesFor(
      withVerbs({
        name: "punch",
        appliesTo: { isUser: true },
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

  it("rejects unknown conditions and items in effects", () => {
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
    expect(messages).toContain('error: verbs.2 (curse).effects.0: Unknown condition "cursed".');
    expect(messages).toContain('error: verbs.2 (curse).effects.1: Unknown item "gold".');
  });

  it("rejects a carriable without weight", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      definitions: [
        ...base.definitions,
        {
          id: "feather",
          name: "feather",
          form: "carriable",
          glyph: { index: 9, color: "#ffffff" },
        },
      ],
    });
    expect(messagesFor(file).some((message) => message.includes("needs a weight"))).toBe(true);
  });

  it("rejects an engine component declared with the wrong fields", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      components: { ...base.components, durability: { fields: { hardness: { type: "number" } } } },
      definitions: base.definitions.filter((definition) => definition.id !== "oven"),
      verbs: base.verbs.filter((verb) => verb.name !== "bake bread"),
    });
    expect(
      messagesFor(file).some((message) => message.includes("The engine reads durability")),
    ).toBe(true);
  });

  it("warns about reactions on properties nothing has", () => {
    const file = buildTestItemFile({
      properties: { sharp: {}, flesh: {}, metal: {}, wooden: {} },
      reactions: [{ stimulus: "fire", property: "wooden", effects: [] }],
    });
    expect(messagesFor(file)).toContain(
      'warning: reactions.0 (fire): Nothing has the property "wooden".',
    );
  });

  it("warns when something could make or destroy coins", () => {
    const messages = messagesFor(
      withVerbs({
        name: "mint",
        appliesTo: { definition: "oven" },
        effects: [{ type: "produce", on: "user", item: "coin", count: 1, into: "user" }],
      }),
      { currencyDefinitionId: "coin" },
    );
    expect(messages).toContain(
      "warning: verbs.2 (mint).effects.0: Makes coin, so the supply isn't closed.",
    );
  });

  it("rejects map and seed references to unknown or wrong-form definitions", () => {
    const messages = messagesFor(buildTestItemFile(), {
      references: [
        { definitionId: "anvil", requiredForm: "placeable", usedBy: "map object smithy anvil" },
        { definitionId: "knife", requiredForm: "placeable", usedBy: "map object kitchen knife" },
      ],
    });
    expect(messages).toEqual([
      'error: definitions: map object smithy anvil uses "anvil", which has no definition.',
      "error: definitions (knife): map object kitchen knife needs a placeable item, but knife is carriable.",
    ]);
  });
});
