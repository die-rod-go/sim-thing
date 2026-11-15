import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "./test-item-file";
import { messagesFor } from "./validation-test-kit";

const ownJaws = { allOf: [{ has: "jaws" }, { where: "self" }] };

const bite = {
  name: "bite",
  appliesTo: ownJaws,
  target: { field: "health.current", above: 0 },
  steps: [{ step: "damage", on: "target", field: "health.current", amount: 0.1 }],
  phrases: { killed: "mauled by {actor}" },
};

const howl = { name: "howl", appliesTo: ownJaws, steps: [] };
const doze = { name: "doze", appliesTo: ownJaws, steps: [{ step: "sleep" }] };

const WOLF_COMPONENTS = {
  jaws: { sightTiles: 8 },
  health: { max: 1, current: 1 },
  stats: { strength: 0.5, agility: 0.5 },
};

interface Extras {
  verbs?: unknown[];
  wolfComponents?: Record<string, unknown>;
  world?: Record<string, unknown>;
}

/** The test file plus a wolf with jaws and stats, its verbs and the given instincts. */
function withInstincts(instincts: unknown[], extras: Extras = {}) {
  const base = buildTestItemFile();
  return buildTestItemFile({
    world: {
      ...base.world,
      creatureStrength: "stats.strength",
      creatureAgility: "stats.agility",
      ...extras.world,
    },
    components: {
      ...base.components,
      jaws: { fields: { sightTiles: { type: "number" } } },
      stats: { fields: { strength: { type: "number" }, agility: { type: "number" } } },
      provoked: {},
    },
    definitions: [
      ...base.definitions,
      {
        id: "wolf",
        name: "wolf",
        glyph: { index: 119, color: "#a8a8b0" },
        components: extras.wolfComponents ?? WOLF_COMPONENTS,
      },
    ],
    verbs: [...base.verbs, bite, ...(extras.verbs ?? [])],
    rules: [
      {
        trigger: "stimulus",
        stimulus: "cut",
        if: { has: "jaws" },
        steps: [{ step: "add", component: "provoked", minutes: 30 }],
      },
    ],
    instincts,
  });
}

const SIGHT = { from: "self.jaws.sightTiles" };
const hunting = { do: "verb", appliesTo: { has: "jaws" }, verb: "bite", range: SIGHT };

describe("instinct validation", () => {
  it("accepts a creature biting with its own body, seeing as far as its own field says", () => {
    expect(messagesFor(withInstincts([hunting]))).toEqual([]);
  });

  it("rejects an instinct naming a verb no creature can do", () => {
    const messages = messagesFor(withInstincts([{ ...hunting, verb: "eat" }, hunting]));
    expect(messages).toContain(
      'error: instincts.0 (verb eat).verb: There is no verb "eat" a creature can do: one whose appliesTo requires `where: self`, or a bare-handed one.',
    );
  });

  it("rejects a verb with a step only an agent can do", () => {
    const file = withInstincts([{ ...hunting, verb: "doze" }, hunting], { verbs: [doze] });
    expect(messagesFor(file)).toContain(
      "error: instincts.0 (verb doze).verb: Only an agent can do a verb with a sleep step.",
    );
  });

  it("rejects going for a component's source with a verb that has no target", () => {
    const file = withInstincts([{ ...hunting, verb: "howl", sourceOf: "provoked" }, hunting], {
      verbs: [howl],
    });
    expect(messagesFor(file)).toContain(
      "error: instincts.0 (verb howl).sourceOf: Going for a component's source needs a verb with a target.",
    );
  });

  it("rejects a value read the creature isn't sure to have", () => {
    const file = withInstincts([
      { ...hunting, range: { from: "self.stats.agility" } },
      { ...hunting, range: { from: "item.jaws.sightTiles" } },
    ]);
    expect(messagesFor(file)).toEqual([
      "error: instincts.0 (verb bite).range: Reads self.stats.agility, but appliesTo doesn't require the stats component.",
      'error: instincts.1 (verb bite).range: "item.jaws.sightTiles" must read the creature itself: self.component.field.',
    ]);
  });

  it("compares the creature with its own fields in appliesTo, if appliesTo requires them", () => {
    const fleeWhenHurt = (field: string) => ({
      do: "flee",
      appliesTo: {
        allOf: [{ has: "jaws" }, { field: "health.current", below: { from: field } }],
      },
      from: { definition: "person" },
      radius: 3,
    });
    expect(messagesFor(withInstincts([hunting, fleeWhenHurt("self.jaws.sightTiles")]))).toEqual([]);
    expect(messagesFor(withInstincts([hunting, fleeWhenHurt("self.stats.agility")]))).toEqual([
      "error: instincts.1 (flee).appliesTo: Reads self.stats.agility, but appliesTo doesn't require the stats component.",
    ]);
  });

  it("warns about an instinct that applies to nothing", () => {
    const nothing = withInstincts([
      hunting,
      { do: "wander", appliesTo: { allOf: [{ has: "jaws" }, { has: "food" }] }, chance: 0.5 },
    ]);
    expect(messagesFor(nothing)).toContain(
      "warning: instincts.1 (wander).appliesTo: appliesTo matches nothing.",
    );
  });

  it("rejects an unknown component in what a creature flees from", () => {
    const file = withInstincts([
      hunting,
      { do: "flee", appliesTo: { has: "jaws" }, from: { has: "fire" }, radius: 3 },
    ]);
    expect(messagesFor(file)).toContain(
      'error: instincts.1 (flee).from: Unknown component "fire".',
    );
  });
});

describe("creature stats", () => {
  it("rejects a creature without the stat fields the world settings name", () => {
    const withoutStats = { jaws: WOLF_COMPONENTS.jaws, health: WOLF_COMPONENTS.health };

    const file = withInstincts([hunting], { wolfComponents: withoutStats });
    expect(messagesFor(file)).toContain(
      "error: definitions.6 (wolf): A creature needs the stats component (world.creatureStrength).",
    );
  });

  it("rejects stat settings that aren't number fields", () => {
    const file = withInstincts([hunting], { world: { creatureStrength: "weapon.stimulus" } });
    expect(messagesFor(file)).toContain(
      'error: world.creatureStrength: "weapon.stimulus" must be a number field.',
    );
  });
});
