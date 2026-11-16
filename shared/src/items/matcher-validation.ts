import {
  listRemovableComponents,
  listViewsWithAddedComponents,
  listViewsWithAddedComponentSets,
} from "./applies-to";
import { parseComponentPath } from "./component-schema";
import type { ItemFile } from "./item-file";
import type { ValidationContext } from "./item-problems";
import {
  isValueRead,
  readFieldComparison,
  type FieldMatcher,
  type Matcher,
} from "./matcher-schema";
import { listMatcherTerms, matchesThing, type ThingView } from "./matchers";

export type MatcherCheck = ValidationContext;

export interface MatcherOptions {
  isAppliesTo?: boolean;
  isTarget?: boolean;
  /** A step's `rule` or `if`, or an instinct's `appliesTo`: a comparison may read a value (checked by its owner). */
  canReadValues?: boolean;
}

function checkFieldTerm(
  term: FieldMatcher,
  path: string,
  check: MatcherCheck,
  options: MatcherOptions,
) {
  const { file, problems } = check;
  const fieldPath = parseComponentPath(term.field);
  const field =
    fieldPath === null ? undefined : file.components[fieldPath.component]?.fields[fieldPath.field];
  if (field === undefined) {
    problems.error(path, `Unknown field "${term.field}".`);
    return;
  }
  const compared = readFieldComparison(term);
  if (compared === null) return;
  const { comparison, value } = compared;
  if (isValueRead(value) && options.canReadValues !== true) {
    problems.error(
      path,
      "A comparison can read a value only in a step's `rule` or `if`: there is no run here.",
    );
  } else if (comparison !== "equals") {
    if (field.type !== "number") {
      problems.error(
        path,
        `\`${comparison}\` needs a number field, but ${term.field} is a ${field.type}.`,
      );
    }
  } else if (isValueRead(value)) {
    if (field.type === "range") {
      problems.error(path, `\`equals\` can't compare ${term.field}, which is a range.`);
    }
  } else {
    const expected = field.type === "item" || field.type === "text" ? "string" : field.type;
    if (typeof value !== expected) {
      problems.error(path, `\`equals\` doesn't fit ${term.field}, which is a ${field.type}.`);
    }
  }
}

/**
 * Unknown names and comparisons that don't fit their field, in a matcher. `where` is only for a
 * verb's `appliesTo` and `target`; `self` is not allowed in `appliesTo` (a bare-handed verb omits
 * it). Comparisons read values only in a step's `rule` or `if`.
 */
export function checkMatcher(
  matcher: Matcher,
  path: string,
  check: MatcherCheck,
  options: MatcherOptions = {},
): void {
  const { file, definitionIds, problems } = check;
  for (const term of listMatcherTerms(matcher)) {
    if ("has" in term && !Object.hasOwn(file.components, term.has)) {
      problems.error(path, `Unknown component "${term.has}".`);
    }
    if ("definition" in term && !definitionIds.has(term.definition)) {
      problems.error(path, `Unknown item "${term.definition}".`);
    }
    if ("where" in term) {
      if (options.isAppliesTo !== true && options.isTarget !== true) {
        problems.error(
          path,
          "`where` only works in a verb's appliesTo and target: there is no user here.",
        );
      }
    }
    if ("field" in term) checkFieldTerm(term, path, check, options);
  }
}

/** A field term as only its component: a field's value changes while the sim runs. */
function relaxFieldTerms(matcher: Matcher): Matcher {
  if ("anyOf" in matcher) return { anyOf: matcher.anyOf.map(relaxFieldTerms) };
  if ("allOf" in matcher) return { allOf: matcher.allOf.map(relaxFieldTerms) };
  if ("not" in matcher) {
    const hasFieldTerm = listMatcherTerms(matcher.not).some((term) => "field" in term);
    return hasFieldTerm ? { allOf: [] } : { not: relaxFieldTerms(matcher.not) };
  }
  if ("field" in matcher) {
    const path = parseComponentPath(matcher.field);
    return path === null ? matcher : { has: path.component };
  }
  return matcher;
}

/** Whether any view matches, counting a field comparison as met by any value of the field. */
export function couldMatchAnyView(matcher: Matcher, views: readonly ThingView[]): boolean {
  const relaxed = relaxFieldTerms(matcher);
  return views.some((view) => matchesThing(relaxed, view));
}

/**
 * The views as the sim could leave them: with every component a step can add, and with every
 * component a step can remove taken off (a component that was removed).
 */
export function listViewsAfterSteps(file: ItemFile, views: readonly ThingView[]): ThingView[] {
  const removable = new Set(listRemovableComponents(file));
  const withoutRemovable = views.map((view) => ({
    ...view,
    components: Object.fromEntries(
      Object.entries(view.components).filter(([name]) => !removable.has(name)),
    ),
  }));
  return [...listViewsWithAddedComponents(file, views), ...withoutRemovable];
}

/**
 * Whether the matcher could meet one of the views as the sim could leave them. Adding every
 * component at once hides a matcher that needs one without another (`open` needs a door closed
 * and not locked), so the views with each one or two added are tried too, but only when nothing
 * else matched: there are many of them, and the editor validates on every change.
 */
export function couldMatchAfterSteps(
  file: ItemFile,
  matcher: Matcher,
  views: readonly ThingView[],
): boolean {
  return (
    couldMatchAnyView(matcher, listViewsAfterSteps(file, views)) ||
    couldMatchAnyView(matcher, listViewsWithAddedComponentSets(file, views))
  );
}
