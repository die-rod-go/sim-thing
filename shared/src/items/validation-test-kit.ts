import type { ItemFile } from "./item-file";
import { findItemFileProblems } from "./item-validation";
import { buildTestItemFile } from "./test-item-file";

export function messagesFor(
  file: ItemFile,
  options: Parameters<typeof findItemFileProblems>[1] = {},
): string[] {
  return findItemFileProblems(file, options).map(
    (problem) => `${problem.severity}: ${problem.path}: ${problem.message}`,
  );
}

/** The test file with the components rules and steps need, plus the given verbs and rules. */
export function buildFile(extras: { verbs?: unknown[]; rules?: unknown[] } = {}): ItemFile {
  const base = buildTestItemFile();
  return buildTestItemFile({
    components: {
      ...base.components,
      burning: {},
      fragile: {},
      breaks_into: { fields: { item: { type: "item" }, label: { type: "text" } } },
      lamp: { fields: { lit: { type: "boolean" }, glow: { type: "number" } } },
    },
    definitions: [
      ...base.definitions,
      {
        id: "relic",
        name: "relic",
        glyph: { index: 7, color: "#ffffff" },
        components: {
          burning: {},
          fragile: {},
          breaks_into: { item: "bread", label: "dust" },
          lamp: { lit: false, glow: 1 },
        },
      },
    ],
    verbs: [...base.verbs, ...(extras.verbs ?? [])],
    rules: extras.rules ?? [],
  });
}

export function withVerbs(...verbs: unknown[]): ItemFile {
  const base = buildTestItemFile();
  return buildTestItemFile({ verbs: [...base.verbs, ...verbs] });
}

export function withRules(...rules: unknown[]): ItemFile {
  return buildFile({ rules });
}

export const attack = {
  name: "attack",
  appliesTo: { allOf: [{ has: "weapon" }, { where: "held" }] },
  target: { field: "health.current", above: 0 },
  steps: [
    { step: "wait", minutes: 1, loudness: 6 },
    { step: "roll_hit", chance: { from: "item.weapon.hitChance" } },
    {
      step: "damage",
      on: "target",
      field: "health.current",
      amount: { from: "item.weapon.damage" },
    },
    { step: "send", on: "target", stimulus: { from: "item.weapon.stimulus" } },
  ],
  phrases: { hit: "hit {target}", missed: "missed {target}", killed: "stabbed by {actor}" },
};
