import { THING_WHERES, type ItemFile, type Matcher } from "@village/shared";

export const MATCHER_KINDS = [
  "definition",
  "has",
  "where",
  "field",
  "allOf",
  "anyOf",
  "not",
] as const;
export type MatcherKind = (typeof MATCHER_KINDS)[number];

export const MATCHER_KIND_LABELS: Record<MatcherKind, string> = {
  definition: "is the item",
  has: "has component",
  where: "is",
  field: "field compares (JSON)",
  allOf: "all of",
  anyOf: "any of",
  not: "not",
};

export function findMatcherKind(matcher: Matcher): MatcherKind {
  const kind = MATCHER_KINDS.find((candidate) => Object.hasOwn(matcher, candidate));
  if (kind === undefined) throw new Error(`Unknown matcher: ${JSON.stringify(matcher)}`);
  return kind;
}

export function isMatcherGroup(
  matcher: Matcher,
): matcher is { allOf: Matcher[] } | { anyOf: Matcher[] } {
  return "allOf" in matcher || "anyOf" in matcher;
}

/** A starting matcher of the kind, naming the first thing of that kind in the file. */
export function buildMatcherOfKind(kind: MatcherKind, file: ItemFile): Matcher {
  switch (kind) {
    case "definition":
      return { definition: file.definitions[0]?.id ?? "" };
    case "has":
      return { has: Object.keys(file.components)[0] ?? "" };
    case "where":
      return { where: THING_WHERES[0] };
    case "field":
      return { field: `${Object.keys(file.components)[0] ?? "component"}.field`, atLeast: 0 };
    case "allOf":
      return { allOf: [] };
    case "anyOf":
      return { anyOf: [] };
    case "not":
      return { not: { where: THING_WHERES[0] } };
  }
}

/** Changes a matcher's kind, keeping its parts when switching between `allOf` and `anyOf`. */
export function changeMatcherKind(matcher: Matcher, kind: MatcherKind, file: ItemFile): Matcher {
  if (isMatcherGroup(matcher)) {
    const parts = "allOf" in matcher ? matcher.allOf : matcher.anyOf;
    if (kind === "allOf") return { allOf: parts };
    if (kind === "anyOf") return { anyOf: parts };
  }
  return buildMatcherOfKind(kind, file);
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
