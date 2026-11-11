import {
  describeCount,
  findDefinition,
  type Agent,
  type ItemCatalog,
  type Verb,
} from "@village/shared";
import { config } from "../config";
import { describeEntityName, findEntityIfPresent } from "../items/entity-store";
import { findVerbByName } from "../items/verb-offers";
import { describePlace } from "../memory/filing";
import type { AgentRuntime } from "./agent-runtime";
import type { WorldState } from "./world-state";

export const WALK_ACTION = "walk_to";
export const WAIT_ACTION = "wait";
export const INTERACT_ACTION = "interact";

const PLACEHOLDERS = { item: "{item}", target: "{target}", verb: "{verb}" } as const;

export type PhraseKind = "ongoing" | "done" | "attempt" | "hit" | "missed" | "killed";

/** The names a phrase can mention. `{actor}` stays in a killed phrase until the death is settled. */
export interface PhraseNames {
  item: string;
  target?: string;
}

/** A verb's phrase from `items.json`, or the default from config when it leaves one out. */
function findPhrase(verb: Verb | undefined, kind: PhraseKind): string {
  return verb?.phrases[kind] ?? config.verbs.defaultPhrases[kind];
}

function fillPhrase(phrase: string, verbName: string, names: PhraseNames): string {
  return phrase
    .split(PLACEHOLDERS.item)
    .join(names.item)
    .split(PLACEHOLDERS.target)
    .join(names.target ?? "")
    .split(PLACEHOLDERS.verb)
    .join(verbName)
    .replace(/ {2,}/g, " ")
    .trim();
}

/** The verb's phrase of that kind with the names filled in: "hit Tobias with knife". */
export function describeVerbPhrase(verb: Verb, kind: PhraseKind, names: PhraseNames): string {
  return fillPhrase(findPhrase(verb, kind), verb.name, names);
}

function describeByName(
  items: ItemCatalog,
  verbName: string,
  kind: PhraseKind,
  names: PhraseNames,
): string {
  return fillPhrase(findPhrase(findVerbByName(items.verbs, verbName), kind), verbName, names);
}

/** "baking bread at the oven" */
export function describeOngoingVerb(
  items: ItemCatalog,
  verbName: string,
  names: PhraseNames,
): string {
  return describeByName(items, verbName, "ongoing", names);
}

/** "baked bread" */
export function describeDoneVerb(items: ItemCatalog, verbName: string, names: PhraseNames): string {
  return describeByName(items, verbName, "done", names);
}

/** "bake bread at the oven", for "I tried to ..." */
export function describeAttempt(items: ItemCatalog, verbName: string, names: PhraseNames): string {
  return describeByName(items, verbName, "attempt", names);
}

/** "4 bread", "a knife and 2 wheat", from counts by definition id. */
export function describeItemCounts(items: ItemCatalog, counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([definitionId, count]) =>
    describeCount(findDefinition(items, definitionId), count),
  );
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
  const entity = findEntityIfPresent(state, destination.entityId);
  return entity ? `the ${describeEntityName(state, entity)}` : null;
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
  if (action.verb !== undefined) {
    const target = runtime.verbRun?.aimName;
    return describeOngoingVerb(state.items, action.verb, { item: action.target ?? "", target });
  }
  return action.target ? `busy with the ${action.target}` : "busy";
}
