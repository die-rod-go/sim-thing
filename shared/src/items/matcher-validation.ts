import { listAllEffects, listViewsWithAddedComponents } from "./applies-to";
import { parseComponentPath } from "./component-schema";
import type { ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";
import { FIELD_COMPARISONS, type FieldMatcher, type Matcher } from "./matcher-schema";
import { listMatcherTerms, matchesThing, type ThingView } from "./matchers";

export interface MatcherCheck {
  file: ItemFile;
  definitionIds: ReadonlySet<string>;
  problems: ProblemList;
}

function checkFieldTerm(term: FieldMatcher, path: string, check: MatcherCheck) {
  const { file, problems } = check;
  const fieldPath = parseComponentPath(term.field);
  const field =
    fieldPath === null ? undefined : file.components[fieldPath.component]?.fields[fieldPath.field];
  if (field === undefined) {
    problems.error(path, `Unknown field "${term.field}".`);
    return;
  }
  const comparison = FIELD_COMPARISONS.find((name) => term[name] !== undefined);
  if (comparison === undefined) return;
  if (comparison === "equals") {
    const expected =
      field.type === "item" ? "string" : field.type === "text" ? "string" : field.type;
    if (typeof term.equals !== expected) {
      problems.error(path, `\`equals\` doesn't fit ${term.field}, which is a ${field.type}.`);
    }
  } else if (field.type !== "number") {
    problems.error(
      path,
      `\`${comparison}\` needs a number field, but ${term.field} is a ${field.type}.`,
    );
  }
}

/**
 * Unknown names and comparisons that don't fit their field, in a matcher. `where` is only for a
 * verb's `appliesTo`, where `self` is not allowed either (a bare-handed verb omits `appliesTo`).
 */
export function checkMatcher(
  matcher: Matcher,
  path: string,
  check: MatcherCheck,
  options: { isAppliesTo?: boolean } = {},
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
      if (options.isAppliesTo !== true) {
        problems.error(path, "`where` only works in a verb's appliesTo: there is no user here.");
      } else if (term.where === "self") {
        problems.error(
          path,
          "`where: self` doesn't work in appliesTo; omit appliesTo for a bare-handed verb.",
        );
      }
    }
    if ("field" in term) checkFieldTerm(term, path, check);
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
 * The views as the sim could leave them: with every component an effect can add, and with every
 * component an effect can remove taken off (an open door has no `closed`).
 */
export function listViewsAfterEffects(file: ItemFile, views: readonly ThingView[]): ThingView[] {
  const removable = new Set(
    listAllEffects(file).flatMap((effect) =>
      effect.type === "remove_condition" ? [effect.condition] : [],
    ),
  );
  const withoutRemovable = views.map((view) => ({
    ...view,
    components: Object.fromEntries(
      Object.entries(view.components).filter(([name]) => !removable.has(name)),
    ),
  }));
  return [...listViewsWithAddedComponents(file, views), ...withoutRemovable];
}
