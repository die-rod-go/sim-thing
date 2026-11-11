import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

function inVerb(effect: Record<string, unknown>, appliesTo: unknown = { has: "lamp" }) {
  return messagesFor(buildFile({ verbs: [{ name: "tinker", appliesTo, effects: [effect] }] }));
}

function inRule(effect: Record<string, unknown>) {
  return messagesFor(
    withRules({ trigger: "every", minutes: 1, if: { has: "lamp" }, effects: [effect] }),
  );
}

const VERB_EFFECT = "error: verbs.2 (tinker).effects.0";
const RULE_EFFECT = "error: rules.0 (every).effects.0";

describe("who an effect acts on", () => {
  it("rejects on: self in a verb and a missing on", () => {
    expect(inVerb({ type: "destroy", on: "self" })).toContain(
      `${VERB_EFFECT}: \`on: self\` is for rules; a verb has no self.`,
    );
    expect(inVerb({ type: "destroy" })).toContain(
      `${VERB_EFFECT}: An effect in a verb needs \`on\`.`,
    );
  });

  it.each(["target", "user", "item", "chosen"])("rejects on: %s in a rule", (subject) => {
    expect(inRule({ type: "destroy", on: subject })).toContain(
      `${RULE_EFFECT}: \`on: ${subject}\` only works in verbs.`,
    );
  });

  it("accepts a rule effect with no on, or on nearby with a radius", () => {
    expect(inRule({ type: "destroy" }).filter((message) => message.startsWith("error"))).toEqual(
      [],
    );
    expect(inRule({ type: "emit", on: "nearby", radius: 1, stimulus: "fire" })).toEqual([]);
  });
});

describe("verb-only effects and settings in a rule", () => {
  it.each([
    { type: "sleep" },
    { type: "read_notes" },
    { type: "post_note" },
    { type: "produce", item: "bread", count: 1, into: "ground" },
    { type: "move", to: "ground" },
  ])("rejects $type in a rule", (effect) => {
    expect(inRule(effect)).toContain(
      `${RULE_EFFECT}: \`${effect.type}\` only works in verbs: a rule has no verb run.`,
    );
  });

  it.each([
    [{ type: "destroy", when: "start" }, "when"],
    [{ type: "destroy", requiresHit: true }, "requiresHit"],
    [{ type: "damage", amount: { min: 0, max: 0 }, scaledByStrength: true }, "scaledByStrength"],
  ])("rejects %j in a rule", (effect, setting) => {
    expect(inRule(effect)).toContain(`${RULE_EFFECT}: \`${setting}\` only works in verbs.`);
  });
});

describe("names and fields an effect uses", () => {
  it("rejects an unknown component, item or transform target", () => {
    expect(inVerb({ type: "add_condition", on: "item", condition: "cursed" })).toContain(
      `${VERB_EFFECT}: Unknown component "cursed".`,
    );
    expect(inVerb({ type: "remove_condition", on: "item", condition: "cursed" })).toContain(
      `${VERB_EFFECT}: Unknown component "cursed".`,
    );
    expect(inVerb({ type: "produce", on: "user", item: "gold", count: 1, into: "user" })).toContain(
      `${VERB_EFFECT}: Unknown item "gold".`,
    );
    expect(inVerb({ type: "transform", on: "item", into: "gold" })).toContain(
      `${VERB_EFFECT}: Unknown item "gold".`,
    );
  });

  it("rejects set and change naming an unknown field", () => {
    expect(inRule({ type: "set", field: "lamp.color", to: 1 })).toContain(
      `${RULE_EFFECT}: Unknown field "lamp.color".`,
    );
    expect(inRule({ type: "change", field: "ghost.glow", by: 1 })).toContain(
      `${RULE_EFFECT}: Unknown field "ghost.glow".`,
    );
  });

  it("rejects change on a field that isn't a number", () => {
    expect(inRule({ type: "change", field: "lamp.lit", by: 1 })).toContain(
      `${RULE_EFFECT}: \`change\` needs a number field, but lamp.lit is a boolean.`,
    );
    expect(inRule({ type: "change", field: "lamp.glow", by: 1 })).toEqual([]);
  });

  it("rejects set to a value that doesn't fit the field", () => {
    expect(inRule({ type: "set", field: "lamp.lit", to: 1 })).toContain(
      `${RULE_EFFECT}: \`to\` must be a boolean to fit lamp.lit.`,
    );
    expect(inRule({ type: "set", field: "lamp.glow", to: "bright" })).toContain(
      `${RULE_EFFECT}: \`to\` must be a number to fit lamp.glow.`,
    );
    expect(inRule({ type: "set", field: "breaks_into.label", to: 3 })).toContain(
      `${RULE_EFFECT}: \`to\` must be a text to fit breaks_into.label.`,
    );
    expect(inRule({ type: "set", field: "lamp.lit", to: true })).toEqual([]);
  });

  it("rejects set on an item field to a definition that doesn't exist", () => {
    expect(inRule({ type: "set", field: "breaks_into.item", to: "gold" })).toContain(
      `${RULE_EFFECT}: Unknown item "gold".`,
    );
    expect(inRule({ type: "set", field: "breaks_into.item", to: "coin" })).toEqual([]);
  });
});
