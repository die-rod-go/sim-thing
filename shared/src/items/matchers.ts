import { parseComponentPath } from "./component-schema";
import type { ResolvedComponents } from "./components";
import type { ItemDefinition } from "./item-file";
import type { FieldMatcher, Matcher, ThingWhere } from "./matcher-schema";

/** What a matcher is checked against: an entity or a body, as it is right now. */
export interface ThingView {
  definitionId: string;
  components: ResolvedComponents;
  /** Absent outside verbs. */
  where?: ThingWhere;
}

function matchesField(matcher: FieldMatcher, view: ThingView): boolean {
  const path = parseComponentPath(matcher.field);
  const value = path === null ? undefined : view.components[path.component]?.[path.field];
  if (value === undefined) return false;
  if (matcher.equals !== undefined) return value === matcher.equals;
  if (typeof value !== "number") return false;
  if (matcher.atLeast !== undefined) return value >= matcher.atLeast;
  if (matcher.atMost !== undefined) return value <= matcher.atMost;
  if (matcher.above !== undefined) return value > matcher.above;
  return matcher.below !== undefined && value < matcher.below;
}

export function matchesThing(matcher: Matcher, view: ThingView): boolean {
  if ("anyOf" in matcher) return matcher.anyOf.some((part) => matchesThing(part, view));
  if ("allOf" in matcher) return matcher.allOf.every((part) => matchesThing(part, view));
  if ("not" in matcher) return !matchesThing(matcher.not, view);
  if ("has" in matcher) return Object.hasOwn(view.components, matcher.has);
  if ("definition" in matcher) return view.definitionId === matcher.definition;
  if ("where" in matcher) return view.where === matcher.where;
  return matchesField(matcher, view);
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
