import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

const burn = { type: "damage", amount: { min: 0.1, max: 0.1 } };
const NEEDS_KILLED =
  "error: rules.0 (every): A rule that does damage to a body needs a `killed` phrase.";

describe("rule reads", () => {
  it("accepts a rule reading a component its if guarantees", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "breaks_into" },
        effects: [{ type: "transform", into: { from: "self.breaks_into.item" } }],
      }),
    );
    expect(messages.filter((message) => message.startsWith("error"))).toEqual([]);
  });

  it("rejects a self read the if doesn't guarantee", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "lamp" },
        effects: [{ type: "transform", into: { from: "self.breaks_into.item" } }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).effects.0.into: Reads self.breaks_into.item, but `if` doesn't require the breaks_into component.",
    );
  });

  it("rejects an item read in a rule and a self read in a verb", () => {
    const rule = messagesFor(
      withRules({
        trigger: "every",
        minutes: 1,
        if: { has: "lamp" },
        effects: [{ type: "change", field: "lamp.glow", by: { from: "item.lamp.glow" } }],
      }),
    );
    expect(rule).toContain(
      "error: rules.0 (every).effects.0.by: Reads item.lamp.glow, but a rule has no item.",
    );
    const verb = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            appliesTo: { has: "lamp" },
            effects: [
              { type: "change", on: "item", field: "lamp.glow", by: { from: "self.lamp.glow" } },
            ],
          },
        ],
      }),
    );
    expect(verb).toContain(
      "error: verbs.2 (tinker).effects.0.by: Reads self.lamp.glow, but a verb has no self.",
    );
  });

  it("rejects an item read in a bare-handed verb", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            effects: [
              { type: "change", on: "user", field: "lamp.glow", by: { from: "item.lamp.glow" } },
            ],
          },
        ],
      }),
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).effects.0.by: Reads item.lamp.glow, but there is no item without appliesTo.",
    );
  });

  it("needs a transform's from to read an item field, not text", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "breaks_into" },
        effects: [{ type: "transform", into: { from: "self.breaks_into.label" } }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).effects.0.into: breaks_into.label is a text, but this needs a item.",
    );
  });

  it("needs a make_sound loudness and a change by to read number fields", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "lamp" },
        effects: [
          { type: "make_sound", loudness: { from: "self.lamp.lit" } },
          { type: "change", field: "lamp.glow", by: { from: "self.lamp.lit" } },
        ],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).effects.0.loudness: lamp.lit is a boolean, but this needs a number.",
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).effects.1.by: lamp.lit is a boolean, but this needs a number.",
    );
  });
});

describe("a rule that does damage", () => {
  it("rejects damage in a rule that could reach a body, lacking killed", () => {
    const rule = { trigger: "every", minutes: 1, if: { has: "flesh" }, effects: [burn] };
    expect(messagesFor(withRules(rule))).toContain(NEEDS_KILLED);
  });

  it("rejects damage on nearby things lacking killed", () => {
    const rule = {
      trigger: "every",
      minutes: 1,
      if: { has: "lamp" },
      effects: [{ ...burn, on: "nearby", radius: 1 }],
    };
    expect(messagesFor(withRules(rule))).toContain(NEEDS_KILLED);
  });

  it("accepts damage with a killed phrase, or to things that can't be a body", () => {
    const withKilled = {
      trigger: "every",
      minutes: 1,
      if: { has: "flesh" },
      killed: "burned to death",
      effects: [burn],
    };
    const aimedAtLamps = { trigger: "every", minutes: 1, if: { has: "lamp" }, effects: [burn] };
    expect(messagesFor(withRules(withKilled))).toEqual([]);
    expect(messagesFor(withRules(aimedAtLamps))).toEqual([]);
  });

  it("counts a component the body could gain", () => {
    const file = buildFile({
      verbs: [
        {
          name: "light",
          appliesTo: { has: "holdable" },
          effects: [{ type: "add_condition", on: "item", condition: "burning" }],
        },
      ],
      rules: [{ trigger: "every", minutes: 1, if: { has: "burning" }, effects: [burn] }],
    });
    expect(messagesFor(file)).toContain(NEEDS_KILLED);
  });
});

describe("the closed supply and rules", () => {
  function supply(effect: Record<string, unknown>, condition: unknown = { has: "lamp" }) {
    return messagesFor(withRules({ trigger: "becomes", if: condition, effects: [effect] }));
  }

  const MAKES_COIN = "warning: rules.0.effects.0: Makes coin, so the supply isn't closed.";
  const DESTROYS_COIN =
    "warning: rules.0.effects.0: Could destroy coin, so the supply isn't closed.";

  it("warns about a rule that transforms into the supplied thing", () => {
    expect(supply({ type: "transform", into: "coin" })).toContain(MAKES_COIN);
  });

  it("warns about a transform whose from reads a field that takes the supplied value", () => {
    const rule = {
      trigger: "becomes",
      if: { has: "breaks_into" },
      effects: [{ type: "transform", into: { from: "self.breaks_into.item" } }],
    };
    expect(messagesFor(withRules(rule))).not.toContain(MAKES_COIN);
    const file = withRules(rule);
    const coinDust = {
      ...file,
      definitions: file.definitions.map((definition) =>
        definition.id === "relic"
          ? {
              ...definition,
              components: { ...definition.components, breaks_into: { item: "coin", label: "x" } },
            }
          : definition,
      ),
    };
    expect(messagesFor(coinDust)).toContain(MAKES_COIN);
  });

  it("warns about a rule that could destroy the supplied thing or acts nearby", () => {
    expect(supply({ type: "destroy" }, { has: "metal" })).toContain(DESTROYS_COIN);
    expect(supply({ type: "destroy", on: "nearby", radius: 1 })).toContain(DESTROYS_COIN);
    expect(supply({ type: "destroy" })).toEqual([]);
  });
});
