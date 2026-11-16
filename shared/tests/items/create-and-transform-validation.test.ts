import { describe, expect, it } from "vitest";
import { buildFile, messagesFor, withRules } from "./validation-test-kit";

const VERB = "error: verbs.2 (tinker)";

function inVerb(steps: Record<string, unknown>[], extras: Record<string, unknown> = {}) {
  return messagesFor(
    buildFile({ verbs: [{ name: "tinker", appliesTo: { has: "food" }, steps, ...extras }] }),
  );
}

function errorsOf(messages: string[]) {
  return messages.filter((message) => message.startsWith("error"));
}

const makeRelic = { step: "create", item: "relic", count: 1, into: "user", as: "made" };

describe("create naming what it made", () => {
  it("lets later steps read and work on the made entity as its definition", () => {
    const messages = inVerb([
      makeRelic,
      {
        step: "create",
        item: "relic",
        count: 1,
        into: "user",
        fields: { "breaks_into.label": { from: "made.breaks_into.label" } },
      },
      { step: "set", on: "made", field: "lamp.glow", to: { from: "made.lamp.glow", times: 2 } },
      { step: "move", on: "item", into: "made" },
    ]);
    expect(errorsOf(messages)).toEqual([]);
  });

  it("guarantees nothing of a definition read from a field", () => {
    const messages = inVerb([
      { ...makeRelic, item: { from: "item.breaks_into.item" } },
      { step: "wait", minutes: { from: "made.lamp.glow" } },
    ]);
    expect(messages).toContain(
      `${VERB}.steps.1.minutes: Reads made.lamp.glow, but the step that named it doesn't require the lamp component.`,
    );
  });

  it("rejects a name used before the create that gives it, and one given twice", () => {
    expect(inVerb([{ step: "destroy", on: "made" }, makeRelic])).toContain(
      `${VERB}.steps.0.on: "made" is used before the step that names it.`,
    );
    expect(inVerb([makeRelic, makeRelic])).toContain(`${VERB}.steps.1.as: "made" is already used.`);
  });

  it("rejects a create reading its own name", () => {
    const messages = inVerb([
      { ...makeRelic, fields: { "breaks_into.label": { from: "made.breaks_into.label" } } },
    ]);
    expect(messages).toContain(
      `${VERB}.steps.0.fields.breaks_into.label: Reads made: "made" is used before the step that names it.`,
    );
  });

  it.each(["user", "item", "nearby", "earshot"])("refuses to parse a create named %s", (name) => {
    expect(() => inVerb([{ ...makeRelic, as: name }])).toThrow("That name is taken by a role.");
  });

  it("rejects naming a creation in a rule", () => {
    const messages = messagesFor(
      withRules({
        trigger: "every",
        minutes: 1,
        if: { has: "lamp" },
        steps: [{ step: "create", item: "bread", count: 1, at: "self", as: "crumb" }],
      }),
    );
    expect(messages).toContain(
      "error: rules.0 (every).steps.0.as: `as` only works in verbs: a rule keeps no names.",
    );
  });
});

describe("fresh ids", () => {
  it("accepts a new id written into a text field by create, set and add", () => {
    const newId = { newId: true };
    const messages = inVerb([
      { ...makeRelic, fields: { "breaks_into.label": newId } },
      { step: "set", on: "made", field: "breaks_into.label", to: newId },
      {
        step: "add",
        on: "item",
        component: "breaks_into",
        fields: { item: "bread", label: newId },
      },
    ]);
    expect(errorsOf(messages)).toEqual([]);
  });

  it("rejects a new id for a field that isn't text", () => {
    expect(inVerb([{ ...makeRelic, fields: { "lamp.glow": { newId: true } } }])).toContain(
      `${VERB}.steps.0.fields.lamp.glow: The value must be a number to fit lamp.glow.`,
    );
  });
});

describe("reading a thing after a transform", () => {
  it("reads the new definition's fields after a transform into a literal", () => {
    const steps = [
      { step: "transform", on: "item", into: "relic" },
      { step: "set", on: "item", field: "breaks_into.label", to: { from: "user.name" } },
      { step: "wait", minutes: { from: "item.lamp.glow" } },
    ];
    expect(errorsOf(inVerb(steps))).toEqual([]);
    expect(inVerb(steps.slice(1))).toContain(
      `${VERB}.steps.1.minutes: Reads item.lamp.glow, but appliesTo doesn't require the lamp component.`,
    );
  });

  it("is sure only of what a target that could be a body shares with its new definition", () => {
    const transformTarget = (into: string, readPath: string) =>
      messagesFor(
        buildFile({
          verbs: [
            {
              name: "tinker",
              target: { allOf: [{ has: "flesh" }, { has: "health" }] },
              steps: [
                { step: "transform", on: "target", into },
                { step: "wait", minutes: { from: readPath } },
              ],
            },
          ],
        }),
      );
    expect(errorsOf(transformTarget("oven", "target.health.current"))).toEqual([]);
    expect(transformTarget("relic", "target.lamp.glow")).toContain(
      `${VERB}.steps.1.minutes: Reads target.lamp.glow, but target doesn't require the lamp component.`,
    );
    expect(transformTarget("relic", "target.health.current")).toContain(
      `${VERB}.steps.1.minutes: Reads target.health.current, but target doesn't require the health component.`,
    );
  });
});
