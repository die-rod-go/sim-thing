import {
  FIELD_COMPARISONS,
  parseComponentPath,
  THING_WHERES,
  type FieldComparison,
  type FieldMatcher,
  type FieldType,
  type ItemFile,
  type Matcher,
} from "@village/shared";
import { clientConfig } from "../client-config";

export const MATCHER_KINDS = [
  "has",
  "definition",
  "field",
  "where",
  "allOf",
  "anyOf",
  "not",
] as const;
export type MatcherKind = (typeof MATCHER_KINDS)[number];

export const MATCHER_KIND_LABELS: Record<MatcherKind, string> = {
  has: "has component",
  definition: "is the item",
  field: "field",
  where: "is (where)",
  allOf: "all of",
  anyOf: "any of",
  not: "not",
};

export const FIELD_COMPARISON_LABELS: Record<FieldComparison, string> = {
  atLeast: "at least",
  atMost: "at most",
  above: "above",
  below: "below",
  equals: "equals",
};

type FieldComparisonValue = number | string | boolean;
type MatcherGroup = { allOf: Matcher[] } | { anyOf: Matcher[] };

/** Field types a `field` matcher can compare; a range is rolled, never compared. */
export const MATCHABLE_FIELD_TYPES: readonly FieldType[] = ["number", "boolean", "text", "item"];

export function findMatcherKind(matcher: Matcher): MatcherKind {
  const kind = MATCHER_KINDS.find((candidate) => Object.hasOwn(matcher, candidate));
  if (kind !== undefined) return kind;
  return "field";
}

export function isMatcherGroup(matcher: Matcher): matcher is MatcherGroup {
  return "allOf" in matcher || "anyOf" in matcher;
}

export function listFieldComparisons(fieldType: FieldType | undefined): FieldComparison[] {
  return fieldType === "number" ? [...FIELD_COMPARISONS] : ["equals"];
}

function findFieldType(file: ItemFile, path: string): FieldType | undefined {
  const parsed = parseComponentPath(path);
  return parsed === null
    ? undefined
    : file.components[parsed.component]?.fields[parsed.field]?.type;
}

function buildStartValue(fieldType: FieldType | undefined, file: ItemFile): FieldComparisonValue {
  if (fieldType === "boolean") return false;
  if (fieldType === "text") return "";
  if (fieldType === "item")
    return file.definitions[0]?.id ?? clientConfig.itemEditor.newDefinitionId;
  return 0;
}

function buildFieldMatcher(
  field: string,
  comparison: FieldComparison,
  value: FieldComparisonValue,
): FieldMatcher {
  if (comparison === "equals") return { field, equals: value };
  return { field, [comparison]: typeof value === "number" ? value : 0 };
}

export function findFieldComparison(matcher: FieldMatcher): {
  comparison: FieldComparison;
  value: FieldComparisonValue;
} {
  for (const comparison of FIELD_COMPARISONS) {
    const value = matcher[comparison];
    if (value !== undefined) return { comparison, value };
  }
  return { comparison: "equals", value: 0 };
}

export function setFieldComparison(
  matcher: FieldMatcher,
  comparison: FieldComparison,
): FieldMatcher {
  return buildFieldMatcher(matcher.field, comparison, findFieldComparison(matcher).value);
}

export function setFieldComparisonValue(
  matcher: FieldMatcher,
  value: FieldComparisonValue,
): FieldMatcher {
  return buildFieldMatcher(matcher.field, findFieldComparison(matcher).comparison, value);
}

/** Points the matcher at another field; a field of another type starts a fresh comparison. */
export function setMatcherField(matcher: FieldMatcher, path: string, file: ItemFile): FieldMatcher {
  const newType = findFieldType(file, path);
  if (newType !== undefined && newType === findFieldType(file, matcher.field)) {
    return { ...matcher, field: path };
  }
  const comparison = newType === "number" || newType === undefined ? "atLeast" : "equals";
  return buildFieldMatcher(path, comparison, buildStartValue(newType, file));
}

function buildFirstFieldMatcher(file: ItemFile): FieldMatcher {
  for (const [component, declaration] of Object.entries(file.components)) {
    for (const [field, declared] of Object.entries(declaration.fields)) {
      if (!MATCHABLE_FIELD_TYPES.includes(declared.type)) continue;
      const comparison = declared.type === "number" ? "atLeast" : "equals";
      return buildFieldMatcher(
        `${component}.${field}`,
        comparison,
        buildStartValue(declared.type, file),
      );
    }
  }
  return {
    field: `${clientConfig.itemEditor.newComponentName}.${clientConfig.itemEditor.newFieldName}`,
    equals: 0,
  };
}

/** A starting matcher of the kind, always valid, naming the first thing of that kind in the file. */
export function buildMatcherOfKind(kind: MatcherKind, file: ItemFile): Matcher {
  switch (kind) {
    case "has":
      return { has: Object.keys(file.components)[0] ?? clientConfig.itemEditor.newComponentName };
    case "definition":
      return {
        definition: file.definitions[0]?.id ?? clientConfig.itemEditor.newDefinitionId,
      };
    case "field":
      return buildFirstFieldMatcher(file);
    case "where":
      return { where: THING_WHERES[0] };
    case "allOf":
      return { allOf: [] };
    case "anyOf":
      return { anyOf: [] };
    case "not":
      return { not: { where: THING_WHERES[0] } };
  }
}

export function listMatcherParts(matcher: Matcher): Matcher[] {
  if ("allOf" in matcher) return matcher.allOf;
  if ("anyOf" in matcher) return matcher.anyOf;
  return [];
}

/** The same group with new parts; terms that aren't groups come back unchanged. */
export function withMatcherParts(matcher: Matcher, parts: Matcher[]): Matcher {
  if ("allOf" in matcher) return { allOf: parts };
  if ("anyOf" in matcher) return { anyOf: parts };
  return matcher;
}

/** Changes a matcher's kind, keeping what carries over: group parts, or the term it is wrapped around. */
export function changeMatcherKind(matcher: Matcher, kind: MatcherKind, file: ItemFile): Matcher {
  if (findMatcherKind(matcher) === kind) return matcher;
  if (kind === "not") return { not: matcher };
  if (kind === "allOf" || kind === "anyOf") {
    const parts = isMatcherGroup(matcher) ? listMatcherParts(matcher) : [matcher];
    return kind === "allOf" ? { allOf: parts } : { anyOf: parts };
  }
  if ("not" in matcher && findMatcherKind(matcher.not) === kind) return matcher.not;
  return buildMatcherOfKind(kind, file);
}

function describeGroup(parts: readonly Matcher[], joiner: string, empty: string): string {
  return parts.length === 0 ? empty : parts.map(describeMatcher).join(joiner);
}

/** One readable line: `has door and has closed`, `not where self`, `health.current above 0`. */
export function describeMatcher(matcher: Matcher): string {
  if ("has" in matcher) return `has ${matcher.has}`;
  if ("definition" in matcher) return `is ${matcher.definition}`;
  if ("where" in matcher) return `where ${matcher.where}`;
  if ("allOf" in matcher) return describeGroup(matcher.allOf, " and ", "anything");
  if ("anyOf" in matcher) {
    return `any of (${describeGroup(matcher.anyOf, ", ", "nothing")})`;
  }
  if ("not" in matcher) {
    const inner = describeMatcher(matcher.not);
    return `not ${"allOf" in matcher.not ? `(${inner})` : inner}`;
  }
  const { comparison, value } = findFieldComparison(matcher);
  return `${matcher.field} ${FIELD_COMPARISON_LABELS[comparison]} ${String(value)}`;
}
