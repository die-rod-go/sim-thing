import {
  parseValuePath,
  WORLD_MATCHER_SETTINGS,
  type ItemFile,
  type Matcher,
  type Rule,
  type Step,
  type Verb,
  type WorldSettings,
} from "@village/shared";

/* Generic walkers over an item file, so a rename or a scan is written once. */

/** Applies `change` to every term that isn't a combination, however deep. */
export function mapMatcherTerms(matcher: Matcher, change: (term: Matcher) => Matcher): Matcher {
  if ("anyOf" in matcher) {
    return { anyOf: matcher.anyOf.map((part) => mapMatcherTerms(part, change)) };
  }
  if ("allOf" in matcher) {
    return { allOf: matcher.allOf.map((part) => mapMatcherTerms(part, change)) };
  }
  if ("not" in matcher) return { not: mapMatcherTerms(matcher.not, change) };
  return change(matcher);
}

function mapStepMatchers(step: Step, change: (term: Matcher) => Matcher): Step {
  if ("rule" in step) return { ...step, rule: mapMatcherTerms(step.rule, change) };
  if (step.step === "check") return { ...step, if: mapMatcherTerms(step.if, change) };
  return step;
}

function mapWorldMatchers(world: WorldSettings, change: (term: Matcher) => Matcher) {
  const mapped: WorldSettings = { ...world };
  for (const setting of WORLD_MATCHER_SETTINGS) {
    const matcher = world[setting];
    if (matcher !== undefined) mapped[setting] = mapMatcherTerms(matcher, change);
  }
  return mapped;
}

export function mapFileSteps(file: ItemFile, change: (step: Step) => Step): ItemFile {
  return {
    ...file,
    verbs: file.verbs.map((verb) => ({ ...verb, steps: verb.steps.map(change) })),
    rules: file.rules.map((rule) => ({ ...rule, steps: rule.steps.map(change) })),
  };
}

/**
 * Applies `change` to every term of every matcher in the file: verbs, rules, the steps of both
 * and the world settings.
 */
export function mapFileMatchers(file: ItemFile, change: (term: Matcher) => Matcher): ItemFile {
  const mapVerb = (verb: Verb): Verb => ({
    ...verb,
    appliesTo: verb.appliesTo && mapMatcherTerms(verb.appliesTo, change),
    target: verb.target && mapMatcherTerms(verb.target, change),
  });
  const mapRule = (rule: Rule): Rule => ({ ...rule, if: mapMatcherTerms(rule.if, change) });
  const withMatchers: ItemFile = {
    ...file,
    world: mapWorldMatchers(file.world, change),
    verbs: file.verbs.map(mapVerb),
    rules: file.rules.map(mapRule),
  };
  return mapFileSteps(withMatchers, (step) => mapStepMatchers(step, change));
}

/** The step settings that hold a number, text or definition value. */
const VALUE_SLOT_KEYS: ReadonlySet<string> = new Set([
  "minutes",
  "loudness",
  "chance",
  "by",
  "amount",
  "to",
  "limit",
  "item",
  "count",
  "into",
  "stimulus",
  "perOtherUser",
]);

function mapValuePath(path: string, change: (path: string) => string): string {
  const parsed = parseValuePath(path);
  return parsed?.kind === "field" ? change(path) : path;
}

/** Rewrites the `from` and the text `times` of a value; literals pass through. */
export function mapValueSlot<Slot>(slot: Slot, change: (path: string) => string): Slot {
  if (typeof slot !== "object" || slot === null) return slot;
  const mapped: Record<string, unknown> = Object.fromEntries(Object.entries(slot));
  if (typeof mapped.from === "string") mapped.from = mapValuePath(mapped.from, change);
  if (typeof mapped.times === "string") mapped.times = mapValuePath(mapped.times, change);
  return mapped as Slot;
}

/** Rewrites every field-read value path (`who.component.field`) the step holds. */
export function mapStepValuePaths(step: Step, change: (path: string) => string): Step {
  const mapped = Object.fromEntries(
    Object.entries(step).map(([key, value]): [string, unknown] => {
      if (VALUE_SLOT_KEYS.has(key)) return [key, mapValueSlot(value, change)];
      if (key === "fields" && typeof value === "object" && value !== null) {
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([name, slot]) => [name, mapValueSlot(slot, change)]),
          ),
        ];
      }
      return [key, value];
    }),
  );
  return mapped as Step;
}

/** Rewrites every field-read value path in the file's steps and verb reaches. */
export function mapFileValuePaths(file: ItemFile, change: (path: string) => string): ItemFile {
  const mapped = mapFileSteps(file, (step) => mapStepValuePaths(step, change));
  return {
    ...mapped,
    verbs: mapped.verbs.map((verb) => ({ ...verb, reach: mapValueSlot(verb.reach, change) })),
  };
}
