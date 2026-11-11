import { parseComponentPath } from "./component-schema";
import { WORLD_MATCHER_SETTINGS, type ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";
import type { Matcher } from "./matcher-schema";
import { listMatcherTerms } from "./matchers";

export interface MatcherCheck {
  file: ItemFile;
  definitionIds: ReadonlySet<string>;
  problems: ProblemList;
}

/** Unknown names in a matcher, and `where` in a matcher that has no agent doing a verb. */
export function checkMatcher(matcher: Matcher, path: string, check: MatcherCheck): void {
  const { file, definitionIds, problems } = check;
  for (const term of listMatcherTerms(matcher)) {
    if ("has" in term && !Object.hasOwn(file.components, term.has)) {
      problems.error(path, `Unknown component "${term.has}".`);
    }
    if ("definition" in term && !definitionIds.has(term.definition)) {
      problems.error(path, `Unknown item "${term.definition}".`);
    }
    if ("where" in term) {
      problems.error(path, "`where` only works in a verb: there is no user here.");
    }
    if ("field" in term) {
      const fieldPath = parseComponentPath(term.field);
      const component = fieldPath === null ? undefined : file.components[fieldPath.component];
      if (fieldPath === null || component?.fields[fieldPath.field] === undefined) {
        problems.error(path, `Unknown field "${term.field}".`);
      }
    }
  }
}

function checkAgentBody(check: MatcherCheck) {
  const { file, problems } = check;
  const { agentBody, agentHealth } = file.world;
  const body = file.definitions.find((definition) => definition.id === agentBody);
  if (!body) {
    problems.error("world.agentBody", `"${agentBody}" has no definition.`);
    return;
  }
  const healthPath = parseComponentPath(agentHealth);
  const field =
    healthPath === null
      ? undefined
      : file.components[healthPath.component]?.fields[healthPath.field];
  const hasComponent = healthPath !== null && Object.hasOwn(body.components, healthPath.component);
  if (field?.type !== "number" || !hasComponent) {
    problems.error(
      "world.agentHealth",
      `"${agentHealth}" must be a number field of a component ${agentBody} has.`,
    );
  }
}

/** The `world` block: its matchers' names, and the body and health field every agent needs. */
export function checkWorldSettings(check: MatcherCheck): void {
  for (const setting of WORLD_MATCHER_SETTINGS) {
    const matcher = check.file.world[setting];
    if (matcher !== undefined) checkMatcher(matcher, `world.${setting}`, check);
  }
  checkAgentBody(check);
}
