import { parseComponentPath } from "./component-schema";
import type { ResolvedComponents } from "./components";
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
