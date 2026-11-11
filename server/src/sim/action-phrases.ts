import type { Agent } from "@village/shared";
import { config } from "../config";
import { describeQuantity } from "../economy/inventory";
import { describePlace } from "../memory/filing";
import type { AgentRuntime } from "./agent-runtime";
import type { WorldState } from "./world-state";

export const WALK_ACTION = "walk_to";
export const WAIT_ACTION = "wait";
export const INTERACT_ACTION = "interact";

const TARGET_PLACEHOLDER = "{target}";

function fillTarget(phrase: string, targetName: string): string {
  return phrase.split(TARGET_PLACEHOLDER).join(targetName);
}

function findPhrases(interaction: string): { ongoing: string; done: string } {
  return (
    config.interactionPhrases[interaction] ?? {
      ongoing: `using the ${TARGET_PLACEHOLDER} (${interaction})`,
      done: `used the ${TARGET_PLACEHOLDER} (${interaction})`,
    }
  );
}

/** "baking bread at the oven" */
export function describeOngoingInteraction(interaction: string, targetName: string): string {
  return fillTarget(findPhrases(interaction).ongoing, targetName);
}

/** "baked bread" */
export function describeDoneInteraction(interaction: string, targetName: string): string {
  return fillTarget(findPhrases(interaction).done, targetName);
}

/** "4 bread", "2 wheat and 1 wood" */
export function describeItemCounts(items: Record<string, number>): string {
  const parts = Object.entries(items).map(([item, amount]) => describeQuantity(amount, item));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function describeWalkTarget(state: WorldState, runtime: AgentRuntime): string | null {
  const destination = runtime.walk?.destination;
  if (!destination) return null;
  if (destination.kind === "place") return describePlace(destination.placeName);
  if (destination.kind === "agent") {
    const other = state.agents.find((agent) => agent.id === destination.agentId);
    return other ? `towards ${other.name}` : null;
  }
  const object = state.objects.find((candidate) => candidate.id === destination.objectId);
  return object ? `the ${object.name}` : null;
}

/**
 * What an onlooker sees the agent doing, for awareness and prompts: "walking to the bakery",
 * "baking bread at the oven", "sleeping in the rose cottage bed".
 */
export function describeDoing(state: WorldState, agent: Agent, runtime: AgentRuntime): string {
  if (agent.death !== null) return config.death.doing;
  const action = agent.currentAction;
  if (action === null) return "standing around";
  if (action.kind === WALK_ACTION) {
    const target = describeWalkTarget(state, runtime) ?? action.target ?? "somewhere";
    return target.startsWith("towards ") ? `walking ${target}` : `walking to ${target}`;
  }
  if (action.kind === WAIT_ACTION) return "waiting around";
  if (action.interaction !== undefined) {
    return describeOngoingInteraction(action.interaction, action.target ?? "");
  }
  return action.target ? `busy with the ${action.target}` : "busy";
}
