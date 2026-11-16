import { describe, expect, it } from "vitest";
import shippedItems from "../../../seeds/items.json";
import { parseItemFile } from "../../src/items/item-file";
import { hasItemErrors } from "../../src/items/item-problems";
import { findItemFileProblems } from "../../src/items/item-validation";
import { buildTestItemFile } from "./test-item-file";
import { attack, messagesFor, withVerbs } from "./validation-test-kit";

describe("item file validation", () => {
  it("finds nothing wrong with a sound file", () => {
    expect(messagesFor(buildTestItemFile())).toEqual([]);
  });

  it("finds no errors in the shipped items.json", () => {
    const problems = findItemFileProblems(parseItemFile(shippedItems));
    expect(problems.filter((problem) => problem.severity === "error")).toEqual([]);
    expect(hasItemErrors(problems)).toBe(false);
  });

  it("refuses field words that name a field the component doesn't have", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      components: {
        ...base.components,
        timer: {
          fields: {
            minutesLeft: { type: "number", words: [{ text: "{thing} in {value} min" }] },
          },
        },
      },
    });
    expect(messagesFor(file)).toContain(
      `error: components.timer.minutesLeft.words[0]: "{thing}" isn't a field of this component: words can name only \`{value}\` and its other fields.`,
    );
  });

  it("accepts an attack verb reading its weapon", () => {
    expect(messagesFor(withVerbs(attack))).toEqual([]);
  });

  it("warns when an earlier verb of the same name always applies first", () => {
    const messages = messagesFor(
      withVerbs({
        name: "eat",
        appliesTo: { allOf: [{ has: "food" }, { where: "held" }, { has: "holdable" }] },
        steps: [],
      }),
    );
    expect(messages).toContain(
      'warning: verbs.2 (eat): An earlier "eat" verb always applies first, so this one never runs; narrow its appliesTo with `not`.',
    );
  });

  it("warns when two bare-handed verbs share a name", () => {
    const messages = messagesFor(
      withVerbs({ name: "wave", steps: [] }, { name: "wave", steps: [] }),
    );
    expect(messages.filter((message) => message.includes("never runs"))).toHaveLength(1);
  });

  it("warns only about the narrower of two same-named verbs", () => {
    const messages = messagesFor(
      withVerbs(
        { name: "eat", appliesTo: { allOf: [{ has: "food" }, { where: "held" }] }, steps: [] },
        { name: "eat", appliesTo: { has: "food" }, steps: [] },
      ),
    );
    expect(messages.filter((message) => message.includes("never runs"))).toHaveLength(1);
    expect(messages.some((message) => message.startsWith("warning: verbs.3"))).toBe(false);
  });

  it("allows same-named verbs once one appliesTo excludes the other's items", () => {
    const base = buildTestItemFile();
    const file = buildTestItemFile({
      verbs: [
        {
          name: "throw",
          appliesTo: { allOf: [{ where: "held" }, { not: { definition: "knife" } }] },
          steps: [],
        },
        {
          name: "throw",
          appliesTo: { allOf: [{ where: "held" }, { definition: "knife" }] },
          steps: [],
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
        steps: [],
      }),
    );
    expect(messages).toContain("warning: verbs.2 (polish).appliesTo: appliesTo matches nothing.");
  });

  it.each([{ has: "flesh" }, { has: "health" }])(
    "rejects an appliesTo that can match an agent's body: %j",
    (appliesTo) => {
      const messages = messagesFor(withVerbs({ name: "prod", appliesTo, steps: [] }));
      expect(messages).toContain(
        "error: verbs.2 (prod).appliesTo: appliesTo can match an agent's body (\"person\"); a verb's item is always an entity.",
      );
    },
  );

  it.each([
    { allOf: [{ has: "flesh" }, { where: "held" }] },
    { allOf: [{ has: "flesh" }, { where: "inside" }] },
    { allOf: [{ has: "flesh" }, { not: { definition: "person" } }] },
  ])("accepts an appliesTo that excludes the agent body: %j", (appliesTo) => {
    const messages = messagesFor(withVerbs({ name: "prod", appliesTo, steps: [] }));
    expect(messages.filter((message) => message.includes("agent's body"))).toEqual([]);
  });

  it("rejects reading a component appliesTo doesn't guarantee", () => {
    const messages = messagesFor(
      withVerbs({
        name: "hurt",
        appliesTo: { anyOf: [{ has: "weapon" }, { has: "food" }] },
        steps: [
          {
            step: "damage",
            on: "user",
            field: "health.current",
            amount: { from: "item.weapon.damage" },
          },
        ],
        phrases: { killed: "hurt" },
      }),
    );
    expect(messages.some((message) => message.includes("doesn't require the weapon"))).toBe(true);
  });

  it("rejects a verb with a roll_hit lacking hit and missed phrases", () => {
    const messages = messagesFor(withVerbs({ ...attack, phrases: { killed: "dead" } }));
    expect(messages).toContain(
      "error: verbs.2 (attack).phrases: A verb with a roll_hit needs a `hit` phrase.",
    );
    expect(messages).toContain(
      "error: verbs.2 (attack).phrases: A verb with a roll_hit needs a `missed` phrase.",
    );
  });

  it("rejects a verb that could kill without a killed phrase", () => {
    const messages = messagesFor(
      withVerbs({ ...attack, phrases: { hit: "hit", missed: "missed" } }),
    );
    expect(messages.some((message) => message.includes("needs a `killed` phrase"))).toBe(true);
  });

  it("doesn't ask for a killed phrase when the target can't be a body", () => {
    const messages = messagesFor(
      withVerbs({
        ...attack,
        target: { definition: "oven" },
        phrases: { hit: "hit", missed: "missed" },
      }),
    );
    expect(messages.some((message) => message.includes("killed"))).toBe(false);
  });

  it("rejects unknown components and items in steps", () => {
    const messages = messagesFor(
      withVerbs({
        name: "curse",
        appliesTo: { definition: "oven" },
        steps: [
          { step: "add", on: "user", component: "cursed" },
          { step: "create", item: "gold", count: 1, into: "user" },
        ],
      }),
    );
    expect(messages).toContain('error: verbs.2 (curse).steps.0: Unknown component "cursed".');
    expect(messages).toContain('error: verbs.2 (curse).steps.1.item: Unknown item "gold".');
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
      "error: world.sightBlockedBy: `where` only works in a verb's appliesTo and target: there is no user here.",
    );
  });

  it("warns when something could make or destroy what the closed supply matches", () => {
    const messages = messagesFor(
      withVerbs({
        name: "mint",
        appliesTo: { definition: "oven" },
        steps: [{ step: "create", item: "coin", count: 1, into: "user" }],
      }),
    );
    expect(messages).toContain(
      "warning: verbs.2 (mint).steps.0: Makes coin, so the supply isn't closed.",
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
