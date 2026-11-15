import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "./test-item-file";
import { messagesFor } from "./validation-test-kit";

const bite = {
  name: "bite",
  appliesTo: { allOf: [{ has: "jaws" }, { where: "self" }] },
  target: { field: "health.current", above: 0 },
  steps: [{ step: "damage", on: "target", field: "health.current", amount: 0.1 }],
  phrases: { killed: "mauled by {actor}" },
};

const howl = {
  name: "howl",
  appliesTo: { allOf: [{ has: "jaws" }, { where: "self" }] },
  steps: [],
};

/** The test file plus a wolf with jaws, its verbs and the given instincts. */
function withInstincts(instincts: unknown[], extraVerbs: unknown[] = []) {
  const base = buildTestItemFile();
  return buildTestItemFile({
    components: { ...base.components, jaws: {} },
    definitions: [
      ...base.definitions,
      {
        id: "wolf",
        name: "wolf",
        glyph: { index: 119, color: "#a8a8b0" },
        components: { jaws: {}, health: { max: 1, current: 1 } },
      },
    ],
    verbs: [...base.verbs, bite, ...extraVerbs],
    instincts,
  });
}

describe("instinct validation", () => {
  it("accepts a creature biting with its own body", () => {
    const file = withInstincts([{ do: "verb", appliesTo: { has: "jaws" }, verb: "bite" }]);
    expect(messagesFor(file)).toEqual([]);
  });

  it("rejects an instinct naming a verb that doesn't exist", () => {
    const file = withInstincts([{ do: "verb", appliesTo: { has: "jaws" }, verb: "pounce" }]);
    expect(messagesFor(file)).toContain(
      'error: instincts.0 (verb pounce).verb: There is no verb "pounce".',
    );
  });

  it("rejects a retaliation whose verb has nothing to strike back at", () => {
    const file = withInstincts(
      [{ do: "verb", appliesTo: { has: "jaws" }, verb: "howl", isRetaliation: true }],
      [howl],
    );
    expect(messagesFor(file)).toContain(
      "error: instincts.0 (verb howl): A retaliation needs a verb with a target to strike back at.",
    );
  });

  it("warns about an instinct that applies to nothing", () => {
    const nothing = withInstincts([
      { do: "wander", appliesTo: { allOf: [{ has: "jaws" }, { has: "food" }] }, chance: 0.5 },
    ]);
    expect(messagesFor(nothing)).toContain(
      "warning: instincts.0 (wander).appliesTo: appliesTo matches nothing.",
    );
  });

  it("rejects an unknown component in what a creature flees from", () => {
    const file = withInstincts([
      { do: "flee", appliesTo: { has: "jaws" }, from: { has: "fire" }, radius: 3 },
    ]);
    expect(messagesFor(file)).toContain(
      'error: instincts.0 (flee).from: Unknown component "fire".',
    );
  });
});
