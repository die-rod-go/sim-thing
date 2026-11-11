import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

const burn = { step: "damage", field: "health.current", amount: 0.1 };
const NEEDS_KILLED =
  "error: rules.0 (every): A rule that does damage to a body needs a `killed` phrase.";

describe("rule reads", () => {
  it("accepts a rule reading a component its if guarantees", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "breaks_into" },
        steps: [{ step: "transform", into: { from: "self.breaks_into.item" } }],
      }),
    );
    expect(messages.filter((message) => message.startsWith("error"))).toEqual([]);
  });

  it("rejects a self read the if doesn't guarantee", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "lamp" },
        steps: [{ step: "transform", into: { from: "self.breaks_into.item" } }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).steps.0.into: Reads self.breaks_into.item, but `if` doesn't require the breaks_into component.",
    );
  });

  it("rejects an item read in a rule", () => {
    const messages = messagesFor(
      withRules({
        trigger: "every",
        minutes: 1,
        if: { has: "lamp" },
        steps: [{ step: "change", field: "lamp.glow", by: { from: "item.lamp.glow" } }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (every).steps.0.by: Reads item: `item` only works in verbs: a rule has no item.",
    );
  });

  it("needs a transform's from to read an item field, not text", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "breaks_into" },
        steps: [{ step: "transform", into: { from: "self.breaks_into.label" } }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).steps.0.into: breaks_into.label is a text, but this needs a item.",
    );
  });

  it("needs a sound loudness and a change by to read number fields", () => {
    const messages = messagesFor(
      withRules({
        trigger: "becomes",
        if: { has: "lamp" },
        steps: [
          { step: "sound", loudness: { from: "self.lamp.lit" } },
          { step: "change", field: "lamp.glow", by: { from: "self.lamp.lit" } },
        ],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).steps.0.loudness: lamp.lit is a boolean, but this needs a number.",
    );
    expect(messages).toContain(
      "error: rules.0 (becomes).steps.1.by: lamp.lit is a boolean, but this needs a number.",
    );
  });
});

describe("a rule that does damage", () => {
  it("rejects damage in a rule that could reach a body, lacking killed", () => {
    const rule = { trigger: "every", minutes: 1, if: { has: "flesh" }, steps: [burn] };
    expect(messagesFor(withRules(rule))).toContain(NEEDS_KILLED);
  });

  it("rejects damage on nearby things lacking killed", () => {
    const rule = {
      trigger: "every",
      minutes: 1,
      if: { has: "lamp" },
      steps: [{ ...burn, on: "nearby", radius: 1 }],
    };
    expect(messagesFor(withRules(rule))).toContain(NEEDS_KILLED);
  });

  it("accepts damage with a killed phrase, or to things that can't be a body", () => {
    const withKilled = {
      trigger: "every",
      minutes: 1,
      if: { has: "flesh" },
      killed: "burned to death",
      steps: [burn],
    };
    const aimedAtLamps = { trigger: "every", minutes: 1, if: { has: "lamp" }, steps: [burn] };
    expect(messagesFor(withRules(withKilled))).toEqual([]);
    expect(messagesFor(withRules(aimedAtLamps))).toEqual([]);
  });

  it("counts a component the body could gain", () => {
    const file = buildFile({
      verbs: [
        {
          name: "light",
          appliesTo: { has: "holdable" },
          steps: [{ step: "add", on: "item", component: "burning" }],
        },
      ],
      rules: [{ trigger: "every", minutes: 1, if: { has: "burning" }, steps: [burn] }],
    });
    expect(messagesFor(file)).toContain(NEEDS_KILLED);
  });
});

describe("the closed supply and rules", () => {
  function supply(step: Record<string, unknown>, condition: unknown = { has: "lamp" }) {
    return messagesFor(withRules({ trigger: "becomes", if: condition, steps: [step] }));
  }

  const MAKES_COIN = "warning: rules.0.steps.0: Makes coin, so the supply isn't closed.";
  const DESTROYS_COIN = "warning: rules.0.steps.0: Could destroy coin, so the supply isn't closed.";

  it("warns about a rule that transforms into the supplied thing", () => {
    expect(supply({ step: "transform", into: "coin" })).toContain(MAKES_COIN);
  });

  it("warns about a transform whose from reads a field that takes the supplied value", () => {
    const rule = {
      trigger: "becomes",
      if: { has: "breaks_into" },
      steps: [{ step: "transform", into: { from: "self.breaks_into.item" } }],
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
    expect(supply({ step: "destroy" }, { has: "metal" })).toContain(DESTROYS_COIN);
    expect(supply({ step: "destroy", on: "nearby", radius: 1 })).toContain(DESTROYS_COIN);
    expect(supply({ step: "destroy" })).toEqual([]);
  });

  it("warns about a rule that creates the supplied thing", () => {
    expect(supply({ step: "create", item: "coin", count: 1, at: "self" })).toContain(MAKES_COIN);
  });
});
