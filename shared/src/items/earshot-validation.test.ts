import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

const VERB_STEP = "error: verbs.2 (strum).steps.0";
const RULE_STEP = "error: rules.0 (every).steps.0";

function inVerb(step: Record<string, unknown>) {
  return messagesFor(
    buildFile({ verbs: [{ name: "strum", appliesTo: { has: "lamp" }, steps: [step] }] }),
  );
}

function inRule(step: Record<string, unknown>) {
  return messagesFor(
    withRules({ trigger: "every", minutes: 1, if: { has: "lamp" }, steps: [step] }),
  );
}

const cheerListeners = { step: "change_need", on: "earshot", need: "fun", amount: 0.1 };

describe("steps on earshot", () => {
  it("accepts a loudness read from the item and around the user in a verb", () => {
    expect(
      inVerb({ ...cheerListeners, loudness: { from: "item.lamp.glow" }, around: "user" }),
    ).toEqual([]);
  });

  it("counts from self in a rule when around is left out", () => {
    expect(inRule({ ...cheerListeners, loudness: 8 })).toEqual([]);
  });

  it("needs a loudness, and around in a verb", () => {
    const messages = inVerb(cheerListeners);
    expect(messages).toContain(`${VERB_STEP}: \`on: earshot\` needs a \`loudness\`.`);
    expect(messages).toContain(`${VERB_STEP}: \`on: earshot\` in a verb needs \`around\`.`);
  });

  it("checks the loudness read like any number read", () => {
    expect(
      inVerb({ ...cheerListeners, loudness: { from: "item.lamp.lit" }, around: "user" }),
    ).toContain(`${VERB_STEP}.loudness: lamp.lit is a boolean, but this needs a number.`);
  });

  it("rejects a sound on earshot", () => {
    expect(inRule({ step: "sound", on: "earshot", loudness: 8 })).toContain(
      `${RULE_STEP}: \`sound\` can't run on earshot: whoever hears the sound already hears it.`,
    );
  });

  it("rejects a loudness on a step that isn't on earshot", () => {
    expect(inRule({ ...cheerListeners, on: "self", loudness: 8 })).toContain(
      `${RULE_STEP}: \`loudness\` only works with \`on: earshot\`.`,
    );
  });

  it("rejects earshot anywhere but on", () => {
    expect(inVerb({ step: "move", on: "item", into: "earshot" })).toContain(
      `${VERB_STEP}.into: \`earshot\` only works in \`on\`.`,
    );
  });

  it("asks for a killed phrase when damage on earshot could kill", () => {
    const messages = inRule({
      step: "damage",
      on: "earshot",
      loudness: 8,
      field: "health.current",
      amount: 0.1,
    });
    expect(messages).toContain(
      "error: rules.0 (every): A rule that does damage to a body needs a `killed` phrase.",
    );
  });
});
