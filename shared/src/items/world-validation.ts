import { parseComponentPath } from "./component-schema";
import { WORLD_MATCHER_SETTINGS } from "./item-file";
import { checkMatcher, type MatcherCheck } from "./matcher-validation";

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
