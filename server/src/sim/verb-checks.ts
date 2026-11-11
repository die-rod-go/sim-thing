import { describeCount, findDefinition, resolveEntityComponents, type Verb } from "@village/shared";
import { countHeld, listHeldEntities } from "../items/entity-store";
import type { WorldState } from "./world-state";

/** Why the agent lacks the verb's inputs, or null when it holds them all. */
export function describeShortfall(state: WorldState, agentId: string, verb: Verb): string | null {
  const reasons = Object.entries(verb.inputs).flatMap(([definitionId, needed]) => {
    const held = countHeld(state, agentId, definitionId);
    if (held >= needed) return [];
    const definition = findDefinition(state.items, definitionId);
    const neededText = describeCount(definition, needed);
    return [
      held === 0
        ? `I don't have any ${definition.plural ?? definition.name}: I need ${neededText}`
        : `I don't have enough ${definition.plural ?? definition.name}: I need ${neededText} and have ${held}`,
    ];
  });
  return reasons.length === 0 ? null : reasons.join("; ");
}

/**
 * Why the agent lacks the verb's tools, or null: it must hold every listed definition and, for
 * each listed component, something that has it. The thing being used doesn't count as its own tool.
 */
export function describeMissingTools(
  state: WorldState,
  agentId: string,
  verb: Verb,
  usedEntityId: string | null,
): string | null {
  if (verb.tools === undefined) return null;
  const tools = listHeldEntities(state, agentId)
    .filter((entity) => entity.id !== usedEntityId)
    .map((entity) => ({
      definitionId: entity.definitionId,
      components: resolveEntityComponents(state.items, entity),
    }));
  const missingDefinitions = verb.tools.definitions
    .filter((definitionId) => !tools.some((tool) => tool.definitionId === definitionId))
    .map((definitionId) => `a ${findDefinition(state.items, definitionId).name}`);
  const missingComponents = verb.tools.components
    .filter((component) => !tools.some((tool) => Object.hasOwn(tool.components, component)))
    .map((component) => `something ${component.split("_").join(" ")}`);
  const missing = [...missingDefinitions, ...missingComponents];
  return missing.length === 0 ? null : `I need ${missing.join(" and ")} to do that`;
}
