import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

function inAppliesTo(appliesTo: unknown) {
  return messagesFor(buildFile({ verbs: [{ name: "tinker", appliesTo, effects: [] }] }));
}

function inRuleIf(condition: unknown) {
  return messagesFor(withRules({ trigger: "becomes", if: condition, effects: [] }));
}

const RULE_IF = "error: rules.0 (becomes).if";

describe("matcher names and fields", () => {
  it("rejects an unknown component, item or field in any matcher", () => {
    expect(inAppliesTo({ has: "ghost" })).toContain(
      'error: verbs.2 (tinker).appliesTo: Unknown component "ghost".',
    );
    expect(inRuleIf({ definition: "ghost" })).toContain(`${RULE_IF}: Unknown item "ghost".`);
    expect(inRuleIf({ field: "lamp.color", equals: 1 })).toContain(
      `${RULE_IF}: Unknown field "lamp.color".`,
    );
  });

  it("rejects a numeric comparison on a field that isn't a number", () => {
    expect(inRuleIf({ field: "lamp.lit", atLeast: 1 })).toContain(
      `${RULE_IF}: \`atLeast\` needs a number field, but lamp.lit is a boolean.`,
    );
    expect(inRuleIf({ field: "breaks_into.label", below: 1 })).toContain(
      `${RULE_IF}: \`below\` needs a number field, but breaks_into.label is a text.`,
    );
  });

  it("rejects equals that doesn't fit the field's type", () => {
    expect(inRuleIf({ field: "lamp.glow", equals: "bright" })).toContain(
      `${RULE_IF}: \`equals\` doesn't fit lamp.glow, which is a number.`,
    );
    expect(inRuleIf({ field: "lamp.lit", equals: false })).toEqual([]);
    expect(inRuleIf({ field: "breaks_into.item", equals: "bread" })).toEqual([]);
  });
});

describe("where in a matcher", () => {
  it("rejects where in a rule's if", () => {
    expect(inRuleIf({ where: "held" })).toContain(
      `${RULE_IF}: \`where\` only works in a verb's appliesTo: there is no user here.`,
    );
  });

  it("rejects where: self in appliesTo but accepts the other values", () => {
    expect(inAppliesTo({ allOf: [{ has: "lamp" }, { where: "self" }] })).toContain(
      "error: verbs.2 (tinker).appliesTo: `where: self` doesn't work in appliesTo; omit appliesTo for a bare-handed verb.",
    );
    expect(inAppliesTo({ allOf: [{ has: "lamp" }, { where: "here" }] })).toEqual([]);
  });
});

describe("matchers nothing can match", () => {
  it("warns about an appliesTo and an if that match nothing", () => {
    expect(inAppliesTo({ allOf: [{ has: "lamp" }, { has: "food" }] })).toContain(
      "warning: verbs.2 (tinker).appliesTo: appliesTo matches nothing.",
    );
    expect(inRuleIf({ allOf: [{ has: "lamp" }, { has: "food" }] })).toContain(
      "warning: rules.0 (becomes).if: `if` matches nothing.",
    );
  });

  it("doesn't warn about a field comparison no definition meets at its start", () => {
    expect(inRuleIf({ field: "health.current", atMost: 0 })).toEqual([]);
  });

  it("doesn't warn about a component an effect could add", () => {
    const file = buildFile({
      verbs: [
        {
          name: "wet",
          appliesTo: { has: "food" },
          effects: [{ type: "add_condition", on: "item", condition: "lamp" }],
        },
      ],
      rules: [
        { trigger: "becomes", if: { allOf: [{ has: "food" }, { has: "lamp" }] }, effects: [] },
      ],
    });
    expect(messagesFor(file)).toEqual([]);
  });

  it("doesn't warn about not-having a component every definition has but an effect removes", () => {
    const remover = {
      name: "dim",
      appliesTo: { has: "lamp" },
      effects: [{ type: "remove_condition", on: "item", condition: "lamp" }],
    };
    const file = buildFile({
      verbs: [
        remover,
        {
          name: "tidy",
          appliesTo: { allOf: [{ has: "burning" }, { not: { has: "lamp" } }] },
          effects: [],
        },
      ],
    });
    expect(messagesFor(file)).toEqual([]);
  });

  it("warns about a component no definition has and no effect adds", () => {
    const file = buildFile();
    const messages = messagesFor({
      ...file,
      components: { ...file.components, wooden: { description: "", fields: {}, isVisible: false } },
    });
    expect(messages).toContain("warning: components.wooden: Nothing has this component.");
  });
});
