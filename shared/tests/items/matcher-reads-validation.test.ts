import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "./test-item-file";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

const RELIC_STEP = "error: verbs.2 (tinker).steps.0";

/** A verb on the relic (which has lamp and breaks_into), with the steps given. */
function onRelic(steps: Record<string, unknown>[]) {
  return messagesFor(
    buildFile({ verbs: [{ name: "tinker", appliesTo: { definition: "relic" }, steps }] }),
  );
}

function errorsOf(messages: string[]) {
  return messages.filter((message) => message.startsWith("error"));
}

const brighterThanItem = { field: "lamp.glow", above: { from: "item.lamp.glow" } };
const labelledLikeItem = { field: "breaks_into.label", equals: { from: "item.breaks_into.label" } };

describe("comparisons that read a value", () => {
  it("accepts reads in a require rule and a check's if", () => {
    expect(
      errorsOf(
        onRelic([
          { step: "require", in: "user", rule: { allOf: [{ has: "lamp" }, brighterThanItem] } },
          { step: "check", on: "item", if: labelledLikeItem, otherwise: "it doesn't match" },
        ]),
      ),
    ).toEqual([]);
  });

  it("accepts a read of what an earlier step named", () => {
    const messages = onRelic([
      { step: "require", in: "user", rule: { has: "lamp" }, as: "spare" },
      {
        step: "use_up",
        in: "user",
        rule: { field: "lamp.glow", atLeast: { from: "spare.lamp.glow" } },
      },
    ]);
    expect(errorsOf(messages)).toEqual([]);
  });

  it("rejects a pick whose rule reads its own name", () => {
    const messages = onRelic([
      {
        step: "require",
        in: "user",
        rule: {
          allOf: [{ has: "lamp" }, { field: "lamp.glow", above: { from: "spare.lamp.glow" } }],
        },
        as: "spare",
      },
    ]);
    expect(messages).toContain(
      `${RELIC_STEP}.rule: Reads spare: "spare" is used before the step that names it.`,
    );
  });

  it("rejects a read the named thing doesn't guarantee", () => {
    const messages = onRelic([
      {
        step: "require",
        in: "user",
        rule: { field: "lamp.glow", above: { from: "target.lamp.glow" } },
      },
      {
        step: "require",
        in: "user",
        rule: { field: "lamp.glow", above: { from: "user.lamp.glow" } },
      },
    ]);
    expect(messages).toContain(
      `${RELIC_STEP}.rule: Reads target: \`target\` needs the verb to have a \`target\`.`,
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.1.rule: Reads user.lamp.glow, but the agent body doesn't require the lamp component.",
    );
  });

  it("needs a number for an ordering comparison and the field's own type for equals", () => {
    const messages = onRelic([
      {
        step: "require",
        in: "user",
        rule: { field: "lamp.glow", atMost: { from: "item.breaks_into.label" } },
      },
      {
        step: "require",
        in: "user",
        rule: { field: "breaks_into.label", equals: { from: "item.lamp.glow" } },
      },
      {
        step: "require",
        in: "user",
        rule: { field: "breaks_into.label", atLeast: { from: "item.breaks_into.label" } },
      },
    ]);
    expect(messages).toContain(
      `${RELIC_STEP}.rule: breaks_into.label is a text, but this needs a number.`,
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.1.rule: lamp.glow is a number, but this needs a text.",
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.2.rule: `atLeast` needs a number field, but breaks_into.label is a text.",
    );
  });

  it("rejects a read in appliesTo and target", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          { name: "tinker", appliesTo: brighterThanItem, target: labelledLikeItem, steps: [] },
        ],
      }),
    );
    const problem =
      "A comparison can read a value only in a step's `rule` or `if`: there is no run here.";
    expect(messages).toContain(`error: verbs.2 (tinker).appliesTo: ${problem}`);
    expect(messages).toContain(`error: verbs.2 (tinker).target: ${problem}`);
  });

  it("rejects a read in a rule's if and in the world settings", () => {
    const problem =
      "A comparison can read a value only in a step's `rule` or `if`: there is no run here.";
    const selfBrighter = { field: "lamp.glow", above: { from: "self.lamp.glow" } };
    const rule = messagesFor(
      withRules({ trigger: "every", minutes: 1, if: selfBrighter, steps: [] }),
    );
    expect(rule).toContain(`error: rules.0 (every).if: ${problem}`);
    const base = buildTestItemFile();
    const healthierThanSelf = { field: "health.current", above: { from: "self.health.current" } };
    const world = messagesFor(
      buildTestItemFile({ world: { ...base.world, sightBlockedBy: healthierThanSelf } }),
    );
    expect(world).toContain(`error: world.sightBlockedBy: ${problem}`);
  });
});
