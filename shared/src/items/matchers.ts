import { parseComponentPath } from "./component-schema";
import type { ResolvedComponents } from "./components";
import type { ItemDefinition } from "./item-file";
import {
  isValueRead,
  readFieldComparison,
  type FieldComparison,
  type FieldComparisonTerm,
  type FieldMatcher,
  type Matcher,
  type ThingWhere,
} from "./matcher-schema";

/** What a matcher is checked against: an entity or a body, as it is right now. */
export interface ThingView {
  definitionId: string;
  components: ResolvedComponents;
  /** Absent outside verbs. */
  where?: ThingWhere;
}

function compareField(value: unknown, term: FieldComparisonTerm): boolean {
  const expected = term.value;
  if (term.comparison === "equals") return value === expected;
  if (typeof value !== "number" || typeof expected !== "number") return false;
  if (term.comparison === "atLeast") return value >= expected;
  if (term.comparison === "atMost") return value <= expected;
  if (term.comparison === "above") return value > expected;
  return value < expected;
}

function matchesField(matcher: FieldMatcher, view: ThingView): boolean {
  const path = parseComponentPath(matcher.field);
  const value = path === null ? undefined : view.components[path.component]?.[path.field];
  const term = readFieldComparison(matcher);
  if (value === undefined || term === null || isValueRead(term.value)) return false;
  return compareField(value, term);
}

/**
 * Whether the thing matches. A comparison with a value read still in it never matches: the run
 * resolves reads first (`resolveMatcherReads` on the server), and one it couldn't resolve fails.
 */
export function matchesThing(matcher: Matcher, view: ThingView): boolean {
  if ("anyOf" in matcher) return matcher.anyOf.some((part) => matchesThing(part, view));
  if ("allOf" in matcher) return matcher.allOf.every((part) => matchesThing(part, view));
  if ("not" in matcher) return !matchesThing(matcher.not, view);
  if ("has" in matcher) return Object.hasOwn(view.components, matcher.has);
  if ("definition" in matcher) return view.definitionId === matcher.definition;
  if ("where" in matcher) return view.where === matcher.where;
  return matchesField(matcher, view);
}

/** The same matcher with each field term replaced, however deep. */
export function mapFieldTerms(matcher: Matcher, replace: (term: FieldMatcher) => Matcher): Matcher {
  if ("anyOf" in matcher)
    return { anyOf: matcher.anyOf.map((part) => mapFieldTerms(part, replace)) };
  if ("allOf" in matcher)
    return { allOf: matcher.allOf.map((part) => mapFieldTerms(part, replace)) };
  if ("not" in matcher) return { not: mapFieldTerms(matcher.not, replace) };
  return "field" in matcher ? replace(matcher) : matcher;
}

/** Every field term that compares with a value read, with the path it reads. */
export function listComparisonReads(
  matcher: Matcher,
): { term: FieldMatcher; comparison: FieldComparison; from: string }[] {
  return listMatcherTerms(matcher).flatMap((term) => {
    if (!("field" in term)) return [];
    const comparison = readFieldComparison(term);
    if (comparison === null || !isValueRead(comparison.value)) return [];
    return [{ term, comparison: comparison.comparison, from: comparison.value.from }];
  });
}

/** Every term of the matcher that isn't a combination, however deep. */
export function listMatcherTerms(matcher: Matcher): Matcher[] {
  if ("anyOf" in matcher) return matcher.anyOf.flatMap(listMatcherTerms);
  if ("allOf" in matcher) return matcher.allOf.flatMap(listMatcherTerms);
  if ("not" in matcher) return listMatcherTerms(matcher.not);
  return [matcher];
}

/** The components a matcher's `has` and `field` terms name, however deep, each once. */
export function listMentionedComponents(matcher: Matcher): string[] {
  const names = listMatcherTerms(matcher).flatMap((term) => {
    if ("has" in term) return [term.has];
    const path = "field" in term ? parseComponentPath(term.field) : null;
    return path === null ? [] : [path.component];
  });
  return [...new Set(names)];
}

/**
 * Components every match of the matcher is sure to have, so what it picked may be read: a `has`
 * or `field` term's component, a `definition` term's components, the union over `allOf` and the
 * intersection over `anyOf`. `not` and `where` guarantee nothing.
 */
export function listGuaranteedComponents(
  matcher: Matcher,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
): Set<string> {
  if ("has" in matcher) return new Set([matcher.has]);
  if ("field" in matcher) {
    const path = parseComponentPath(matcher.field);
    return new Set(path === null ? [] : [path.component]);
  }
  if ("definition" in matcher) {
    return new Set(Object.keys(definitionsById.get(matcher.definition)?.components ?? {}));
  }
  if ("allOf" in matcher) {
    return new Set(
      matcher.allOf.flatMap((part) => [...listGuaranteedComponents(part, definitionsById)]),
    );
  }
  if ("anyOf" in matcher) {
    const [first, ...others] = matcher.anyOf.map((part) =>
      listGuaranteedComponents(part, definitionsById),
    );
    if (first === undefined) return new Set();
    return new Set([...first].filter((name) => others.every((set) => set.has(name))));
  }
  return new Set();
}

/** Whether every match is somewhere `where` says, by a `where` term every match must meet. */
export function requiresWhere(matcher: Matcher, where: ThingWhere): boolean {
  if ("where" in matcher) return matcher.where === where;
  if ("allOf" in matcher) return matcher.allOf.some((part) => requiresWhere(part, where));
  if ("anyOf" in matcher) {
    return matcher.anyOf.length > 0 && matcher.anyOf.every((part) => requiresWhere(part, where));
  }
  return false;
}
