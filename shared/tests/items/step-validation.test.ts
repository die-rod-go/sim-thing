import { describe, expect, it } from "vitest";
import { attack, buildFile, messagesFor, withRules } from "./validation-test-kit";

function inVerb(steps: Record<string, unknown>[], extras: Record<string, unknown> = {}) {
  return messagesFor(
    buildFile({ verbs: [{ name: "tinker", appliesTo: { has: "lamp" }, steps, ...extras }] }),
  );
}

function inRule(step: Record<string, unknown>) {
  return messagesFor(
    withRules({ trigger: "every", minutes: 1, if: { has: "lamp" }, steps: [step] }),
  );
}

function errorsOf(messages: string[]) {
  return messages.filter((message) => message.startsWith("error"));
}

const VERB_STEP = "error: verbs.2 (tinker).steps.0";
const RULE_STEP = "error: rules.0 (every).steps.0";

describe("what a step works on", () => {
  it("rejects on: self in a verb and a missing on", () => {
    expect(inVerb([{ step: "destroy", on: "self" }])).toContain(
      `${VERB_STEP}.on: \`self\` is for rules; a verb has no self.`,
    );
    expect(inVerb([{ step: "destroy" }])).toContain(`${VERB_STEP}: A step in a verb needs \`on\`.`);
  });

  it.each(["target", "user", "item"])("rejects on: %s in a rule", (name) => {
    expect(inRule({ step: "destroy", on: name })).toContain(
      `${RULE_STEP}.on: \`${name}\` only works in verbs: a rule has no ${name}.`,
    );
  });

  it("accepts a rule step with no on, or on nearby with a radius", () => {
    expect(errorsOf(inRule({ step: "destroy" }))).toEqual([]);
    expect(inRule({ step: "send", on: "nearby", radius: 1, stimulus: "fire" })).toEqual([]);
  });

  it("rejects item or target in a verb that has none", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            steps: [
              { step: "destroy", on: "item" },
              { step: "destroy", on: "target" },
            ],
          },
        ],
      }),
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.0.on: `item` needs the verb to have `appliesTo`.",
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.1.on: `target` needs the verb to have a `target`.",
    );
  });

  it("rejects nearby without a radius, and in a verb without around", () => {
    const messages = inVerb([{ step: "send", on: "nearby", stimulus: "fire" }]);
    expect(messages).toContain(`${VERB_STEP}: \`on: nearby\` needs a \`radius\`.`);
    expect(messages).toContain(`${VERB_STEP}: \`on: nearby\` in a verb needs \`around\`.`);
    expect(
      inVerb([{ step: "send", on: "nearby", radius: 2, around: "item", stimulus: "fire" }]),
    ).toEqual([]);
  });

  it("rejects into naming nothing known, and needs exactly one of into and at", () => {
    expect(inVerb([{ step: "move", on: "item", into: "box" }])).toContain(
      `${VERB_STEP}.into: Unknown name "box": no earlier step names it with \`as\`.`,
    );
    expect(inVerb([{ step: "move", on: "item" }])).toContain(
      `${VERB_STEP}: \`move\` needs exactly one of \`into\` and \`at\`.`,
    );
  });

  it("rejects in naming something but the user, item or target", () => {
    expect(inVerb([{ step: "require", in: "self", rule: { has: "food" } }])).toContain(
      `${VERB_STEP}.in: \`in\` must be \`user\`, \`item\` or \`target\`.`,
    );
  });
});

describe("as names", () => {
  const pick = { step: "use_up", in: "user", rule: { has: "food" }, as: "meal" };

  it("lets later steps use a named pick", () => {
    const messages = inVerb([
      pick,
      { step: "change_need", on: "user", need: "hunger", amount: { from: "meal.food.hunger" } },
      { step: "move", on: "item", into: "meal" },
    ]);
    expect(errorsOf(messages)).toEqual([]);
  });

  it("rejects a name used before the step that gives it", () => {
    const messages = inVerb([{ step: "destroy", on: "meal" }, pick]);
    expect(messages).toContain(`${VERB_STEP}.on: "meal" is used before the step that names it.`);
  });

  it("rejects a read of a named pick the rule doesn't guarantee", () => {
    const messages = inVerb([
      pick,
      { step: "change_need", on: "user", need: "hunger", amount: { from: "meal.weapon.damage" } },
    ]);
    expect(
      messages.some((message) =>
        message.includes("the step that named it doesn't require the weapon"),
      ),
    ).toBe(true);
  });

  it.each(["user", "item", "target", "self", "choice", "nearby", "earshot"])(
    "refuses to parse a pick named %s",
    (name) => {
      expect(() => inVerb([{ ...pick, as: name }])).toThrow("That name is taken by a role.");
    },
  );

  it("rejects naming two picks the same", () => {
    expect(inVerb([pick, pick])).toContain(
      'error: verbs.2 (tinker).steps.1.as: "meal" is already used.',
    );
  });
});

describe("value reads", () => {
  it("accepts a read of a component the body has and rejects one it lacks", () => {
    const wait = (path: string) => [{ step: "wait", minutes: { from: path } }];
    expect(inVerb(wait("user.health.current"))).toEqual([]);
    expect(inVerb(wait("user.weapon.hitChance"))).toContain(
      `${VERB_STEP}.minutes: Reads user.weapon.hitChance, but the agent body doesn't require the weapon component.`,
    );
  });

  it("rejects reading target fields the target matcher doesn't guarantee", () => {
    const steps = [{ step: "wait", minutes: { from: "target.lamp.glow" } }];
    const withTarget = (target: unknown) =>
      messagesFor(buildFile({ verbs: [{ name: "tinker", target, steps }] }));
    expect(withTarget({ has: "lamp" })).toEqual([]);
    expect(withTarget({ has: "food" })).toContain(
      `${VERB_STEP}.minutes: Reads target.lamp.glow, but target doesn't require the lamp component.`,
    );
  });

  it("rejects a read of the wrong field type for the slot", () => {
    expect(
      inVerb([{ step: "wait", minutes: { from: "item.lamp.glow", times: "item.lamp.glow" } }]),
    ).toEqual([]);
    expect(inVerb([{ step: "wait", minutes: { from: "item.lamp.lit" } }])).toContain(
      `${VERB_STEP}.minutes: lamp.lit is a boolean, but this needs a number.`,
    );
  });

  it("needs times to read a number field, not a range", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            appliesTo: { has: "weapon" },
            steps: [{ step: "wait", minutes: { min: 1, max: 2, times: "item.weapon.damage" } }],
          },
        ],
      }),
    );
    expect(messages).toContain(
      `${VERB_STEP}.minutes.times: weapon.damage is a range, but this needs a number.`,
    );
  });

  it("checks a set's read against the field it sets", () => {
    const messages = inVerb([
      { step: "set", on: "item", field: "lamp.glow", to: { from: "item.lamp.lit" } },
    ]);
    expect(messages).toContain(`${VERB_STEP}.to: lamp.lit is a boolean, but this needs a number.`);
  });

  it("allows user.name in a text field and rejects it in a number slot", () => {
    const create = [
      {
        step: "create",
        item: "relic",
        count: 1,
        into: "user",
        fields: { "breaks_into.label": { from: "user.name" } },
      },
    ];
    expect(inVerb(create)).toEqual([]);
    expect(inVerb([{ step: "wait", minutes: { from: "user.name" } }])).toContain(
      `${VERB_STEP}.minutes: user.name is a text, but this needs a number.`,
    );
  });

  it("needs minutes and text in takes, but always allows amount", () => {
    const create = [
      {
        step: "create",
        item: "relic",
        count: { from: "choice.amount" },
        into: "user",
        fields: { "breaks_into.label": { from: "choice.text" } },
      },
    ];
    expect(inVerb(create)).toContain(
      `${VERB_STEP}.fields.breaks_into.label: Reads choice.text, but the verb doesn't list "text" in takes.`,
    );
    expect(inVerb(create, { takes: ["text"] })).toEqual([]);
    expect(inVerb([{ step: "wait", minutes: { from: "choice.minutes" } }])).toContain(
      `${VERB_STEP}.minutes: Reads choice.minutes, but the verb doesn't list "minutes" in takes.`,
    );
    expect(inVerb([{ step: "wait", minutes: { from: "choice.amount" } }])).toEqual([]);
  });

  it("rejects any choice read in a rule", () => {
    expect(inRule({ step: "sound", loudness: { from: "choice.amount" } })).toContain(
      `${RULE_STEP}.loudness: Reads choice.amount, but a rule has no choice.`,
    );
  });

  it("checks the reads in a verb's reach", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            appliesTo: { has: "food" },
            reach: { from: "item.lamp.glow" },
            steps: [],
          },
        ],
      }),
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).reach: Reads item.lamp.glow, but appliesTo doesn't require the lamp component.",
    );
  });
});

describe("verb-only steps and settings in a rule", () => {
  it.each([
    { step: "sleep" },
    { step: "wait", minutes: 1 },
    { step: "roll_hit", chance: 0.5 },
    { step: "require", in: "self", rule: { has: "food" } },
    { step: "check", if: { has: "lamp" }, otherwise: "no" },
    { step: "read", field: "breaks_into.label" },
  ])("rejects $step in a rule", (step) => {
    expect(inRule(step)).toContain(
      `${RULE_STEP}: \`${step.step}\` only works in verbs: a rule has no verb run.`,
    );
  });

  it("rejects a verb-only step in a rule", () => {
    expect(inRule({ step: "wait", minutes: 1 })).toContain(
      `${RULE_STEP}: \`wait\` only works in verbs: a rule has no verb run.`,
    );
  });

  it("rejects in: item or in: target in a verb without them", () => {
    const messages = messagesFor(
      buildFile({
        verbs: [
          {
            name: "tinker",
            steps: [
              { step: "require", in: "item", rule: { has: "food" } },
              { step: "use_up", in: "target", rule: { has: "food" } },
            ],
          },
        ],
      }),
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.0.in: `item` needs the verb to have `appliesTo`.",
    );
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.1.in: `target` needs the verb to have a `target`.",
    );
  });

  it("rejects scaledByStrength and evenOnMiss in a rule", () => {
    expect(
      inRule({ step: "damage", field: "lamp.glow", amount: 1, scaledByStrength: true }),
    ).toContain(`${RULE_STEP}: \`scaledByStrength\` only works in verbs.`);
    expect(inRule({ step: "destroy", evenOnMiss: true })).toContain(
      `${RULE_STEP}: \`evenOnMiss\` only works in verbs.`,
    );
  });
});

describe("the order of steps in a verb", () => {
  const roll = { step: "roll_hit", chance: 0.5 };
  const inAttack = (steps: unknown[]) => messagesFor(buildFile({ verbs: [{ ...attack, steps }] }));

  it("rejects evenOnMiss with no roll_hit above it", () => {
    const message = `${VERB_STEP}: \`evenOnMiss\` needs a \`roll_hit\` above it.`;
    expect(inVerb([{ step: "destroy", on: "item", evenOnMiss: true }])).toContain(message);
    expect(inVerb([{ step: "destroy", on: "item", evenOnMiss: true }, roll])).toContain(message);
  });

  it("rejects evenOnMiss on a move to the target with no roll_hit above it", () => {
    expect(inVerb([{ step: "move", on: "item", at: "target", evenOnMiss: true }])).toContain(
      `${VERB_STEP}: \`evenOnMiss\` needs a \`roll_hit\` above it.`,
    );
  });

  it("accepts evenOnMiss below a roll_hit", () => {
    const messages = inAttack([roll, { step: "destroy", on: "target", evenOnMiss: true }]);
    expect(errorsOf(messages)).toEqual([]);
  });

  it("rejects a second roll_hit", () => {
    expect(inAttack([roll, roll])).toContain(
      "error: verbs.2 (attack).steps.1: A verb can have only one `roll_hit`.",
    );
  });

  it("rejects a roll_hit in a verb without a target", () => {
    expect(inVerb([roll], { phrases: { hit: "h", missed: "m" } })).toContain(
      `${VERB_STEP}: \`roll_hit\` needs a verb with a \`target\`.`,
    );
  });

  it("rejects loudness on a wait that isn't the first", () => {
    const messages = inVerb([
      { step: "wait", minutes: 1 },
      { step: "wait", minutes: 1, loudness: 3 },
    ]);
    expect(messages).toContain(
      "error: verbs.2 (tinker).steps.1: `loudness` only works on a verb's first `wait`.",
    );
    const loudFirst = [
      { step: "wait", minutes: 1, loudness: 3 },
      { step: "wait", minutes: 1 },
    ];
    expect(inVerb(loudFirst)).toEqual([]);
  });
});

describe("killed phrases", () => {
  const NEEDS_KILLED =
    "error: verbs.2 (hurt).phrases: A verb that could kill needs a `killed` phrase to name the death.";

  function hurt(damage: Record<string, unknown>, target?: unknown, phrases: unknown = {}) {
    return messagesFor(
      buildFile({
        verbs: [
          {
            name: "hurt",
            appliesTo: { has: "lamp" },
            target,
            steps: [{ step: "damage", field: "health.current", amount: 0.1, ...damage }],
            phrases,
          },
        ],
      }),
    );
  }

  it("asks for a killed phrase when damage reaches the user or a target that could be a body", () => {
    expect(hurt({ on: "user" })).toContain(NEEDS_KILLED);
    expect(hurt({ on: "target" }, { has: "flesh" })).toContain(NEEDS_KILLED);
    expect(hurt({ on: "target" }, { field: "health.current", above: 0 })).toContain(NEEDS_KILLED);
  });

  it("asks for nothing when the target can't be a body or a killed phrase is given", () => {
    expect(hurt({ on: "target" }, { definition: "oven" })).not.toContain(NEEDS_KILLED);
    expect(hurt({ on: "user" }, undefined, { killed: "died" })).not.toContain(NEEDS_KILLED);
  });

  it("asks for a killed phrase on nearby damage", () => {
    expect(hurt({ on: "nearby", radius: 1, around: "user" })).toContain(NEEDS_KILLED);
  });
});

describe("names and fields a step uses", () => {
  it("rejects an unknown component, item or transform target", () => {
    expect(inVerb([{ step: "remove", on: "item", component: "cursed" }])).toContain(
      `${VERB_STEP}: Unknown component "cursed".`,
    );
    expect(inVerb([{ step: "transform", on: "item", into: "gold" }])).toContain(
      `${VERB_STEP}.into: Unknown item "gold".`,
    );
  });

  it("rejects set and change naming an unknown field", () => {
    expect(inRule({ step: "set", field: "lamp.color", to: 1 })).toContain(
      `${RULE_STEP}: Unknown field "lamp.color".`,
    );
    expect(inRule({ step: "change", field: "ghost.glow", by: 1 })).toContain(
      `${RULE_STEP}: Unknown field "ghost.glow".`,
    );
  });

  it("rejects change and damage on a field that isn't a number", () => {
    expect(inRule({ step: "change", field: "lamp.lit", by: 1 })).toContain(
      `${RULE_STEP}: \`change\` needs a number field, but lamp.lit is a boolean.`,
    );
    expect(inRule({ step: "damage", field: "lamp.lit", amount: 1 })).toContain(
      `${RULE_STEP}: \`damage\` needs a number field, but lamp.lit is a boolean.`,
    );
    expect(inRule({ step: "change", field: "lamp.glow", by: 1 })).toEqual([]);
  });

  it("rejects set to a value that doesn't fit the field", () => {
    expect(inRule({ step: "set", field: "lamp.lit", to: 1 })).toContain(
      `${RULE_STEP}.to: The value must be a boolean to fit lamp.lit.`,
    );
    expect(inRule({ step: "set", field: "lamp.glow", to: "bright" })).toContain(
      `${RULE_STEP}.to: The value must be a number to fit lamp.glow.`,
    );
    expect(inRule({ step: "set", field: "lamp.lit", to: true })).toEqual([]);
  });

  it("rejects an item field set to a definition that doesn't exist", () => {
    expect(inRule({ step: "set", field: "breaks_into.item", to: "gold" })).toContain(
      `${RULE_STEP}.to: Unknown item "gold".`,
    );
    expect(inRule({ step: "set", field: "breaks_into.item", to: "coin" })).toEqual([]);
  });

  it("rejects create and add fields naming unknown fields or values that don't fit", () => {
    const create = { step: "create", item: "relic", count: 1, into: "user" };
    expect(inVerb([{ ...create, fields: { "lamp.hue": 1 } }])).toContain(
      `${VERB_STEP}.fields: Unknown field "lamp.hue".`,
    );
    expect(
      inVerb([{ step: "add", on: "item", component: "lamp", fields: { glow: "x" } }]),
    ).toContain(`${VERB_STEP}.fields.glow: The value must be a number to fit lamp.glow.`);
  });

  it("needs read to name text fields", () => {
    expect(inVerb([{ step: "read", on: "item", field: "lamp.glow" }])).toContain(
      `${VERB_STEP}: \`field\` needs a text field, but lamp.glow is a number.`,
    );
    const author = { step: "read", on: "item", field: "breaks_into.label", author: "lamp.lit" };
    expect(inVerb([author])).toContain(
      `${VERB_STEP}: \`author\` needs a text field, but lamp.lit is a boolean.`,
    );
  });

  it("checks the matchers in check and use_up", () => {
    expect(
      inVerb([{ step: "check", on: "item", if: { has: "ghost" }, otherwise: "no" }]),
    ).toContain(`${VERB_STEP}.if: Unknown component "ghost".`);
    expect(inVerb([{ step: "use_up", in: "user", rule: { where: "held" } }])).toContain(
      `${VERB_STEP}.rule: \`where\` only works in a verb's appliesTo and target: there is no user here.`,
    );
  });
});

describe("the closed supply and verbs", () => {
  const MAKES_COIN = "warning: verbs.2 (tinker).steps.0: Makes coin, so the supply isn't closed.";
  const DESTROYS_COIN =
    "warning: verbs.2 (tinker).steps.0: Could destroy coin, so the supply isn't closed.";

  it("warns about a create into the supplied definition", () => {
    expect(inVerb([{ step: "create", item: "coin", count: 1, into: "user" }])).toContain(
      MAKES_COIN,
    );
  });

  it("warns about destroying the item when the item could be the supplied thing", () => {
    const destroy = [{ step: "destroy", on: "item" }];
    expect(
      messagesFor(
        buildFile({ verbs: [{ name: "tinker", appliesTo: { has: "metal" }, steps: destroy }] }),
      ),
    ).toContain(DESTROYS_COIN);
    expect(inVerb(destroy)).toEqual([]);
  });

  it("warns about a use_up whose rule matches the supplied thing", () => {
    const messages = inVerb([{ step: "use_up", in: "user", rule: { definition: "coin" } }]);
    expect(messages).toContain(
      "warning: verbs.2 (tinker).steps.0: Uses up coin, so the supply isn't closed.",
    );
  });

  it("warns conservatively about destroying nearby things", () => {
    expect(inVerb([{ step: "destroy", on: "nearby", radius: 1, around: "user" }])).toContain(
      DESTROYS_COIN,
    );
  });
});

describe("if blocks", () => {
  const IF_LIT = { step: "if", on: "item", if: { field: "lamp.lit", equals: true } };

  it("accepts a closed block with an else", () => {
    const steps = [IF_LIT, { step: "destroy", on: "item" }, { step: "else" }, { step: "end_if" }];
    expect(errorsOf(inVerb(steps))).toEqual([]);
  });

  it("rejects an if with no end_if", () => {
    expect(inVerb([IF_LIT])).toContain(`${VERB_STEP}: This \`if\` needs an \`end_if\` below it.`);
  });

  it("rejects using a name given inside a block after it closes", () => {
    const steps = [
      IF_LIT,
      { step: "require", in: "item", rule: { has: "lamp" }, as: "wick" },
      { step: "end_if" },
      { step: "destroy", on: "wick" },
    ];
    expect(inVerb(steps)).toContain(
      'error: verbs.2 (tinker).steps.3.on: "wick" is named in only one branch of an `if` block, so it may not exist here.',
    );
  });

  it("accepts using a name both branches give after the block", () => {
    const pick = { step: "require", in: "item", rule: { has: "lamp" }, as: "wick" };
    const steps = [IF_LIT, pick, { step: "else" }, pick, { step: "end_if" }];
    expect(errorsOf(inVerb([...steps, { step: "destroy", on: "wick" }]))).toEqual([]);
  });

  it("remembers a transform inside a block after the block closes", () => {
    const steps = [
      { step: "require", in: "user", rule: { has: "lamp" }, as: "wick" },
      IF_LIT,
      { step: "transform", on: "wick", into: "bread" },
      { step: "end_if" },
      { step: "change", on: "item", field: "lamp.glow", by: { from: "wick.lamp.glow" } },
    ];
    expect(inVerb(steps)).toContain(
      "error: verbs.2 (tinker).steps.4.by: Reads wick.lamp.glow, but the step that named it doesn't require the lamp component.",
    );
  });

  it("takes loudness on the first wait of either branch", () => {
    const steps = [
      IF_LIT,
      { step: "wait", minutes: 30, loudness: 8 },
      { step: "else" },
      { step: "wait", minutes: 5, loudness: 2 },
      { step: "end_if" },
    ];
    expect(errorsOf(inVerb(steps))).toEqual([]);
  });

  it("rejects a roll_hit inside a block", () => {
    const steps = [IF_LIT, { step: "roll_hit", chance: 0.5 }, { step: "end_if" }];
    expect(inVerb(steps, { target: { has: "lamp" } })).toContain(
      "error: verbs.2 (tinker).steps.1: `roll_hit` can't go inside an `if` block.",
    );
  });
});
