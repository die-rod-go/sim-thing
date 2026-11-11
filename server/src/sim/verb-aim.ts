import { findDefinition, type Entity, type Position, type Verb } from "@village/shared";
import { config } from "../config";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance } from "../economy/give";
import {
  describeEntityName,
  findEntityIfPresent,
  listHeldEntities,
  listTileEntitiesAt,
  resolveEntityPosition,
} from "../items/entity-store";
import { resolveNumber } from "../items/verb-numbers";
import { canSee } from "../perception/sight";
import { isDead } from "../status/health";
import type { VerbAim } from "./agent-runtime";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  listOthersAsSeen,
} from "./world-access";
import type { WorldState } from "./world-state";

/** Whose words a target's name is put in: an onlooker's, the user's own, or the target's own. */
export type AimPerspective = "others" | "user" | "target";

export type AimResolution = { aim: VerbAim } | { failure: string };

function canAimAtAgents(verb: Verb): boolean {
  return verb.target === "agent" || verb.target === "agent_or_entity";
}

function canAimAtEntities(verb: Verb): boolean {
  return verb.target === "entity" || verb.target === "agent_or_entity";
}

function isSelfName(state: WorldState, agentId: string, wanted: string): boolean {
  return (
    wanted === normalizeDisplayName(config.verbs.selfTargetName) ||
    wanted === normalizeDisplayName(findAgent(state, agentId).name)
  );
}

/** A thing here or another thing the user carries, by the name prompts use for it. */
function findEntityByName(
  state: WorldState,
  agentId: string,
  wanted: string,
  usedEntityId: string | null,
): Entity | undefined {
  const agent = findAgent(state, agentId);
  const carried = listHeldEntities(state, agentId).filter((entity) => entity.id !== usedEntityId);
  return [...listTileEntitiesAt(state, agent.place), ...carried].find(
    (entity) => normalizeDisplayName(describeEntityName(state, entity)) === wanted,
  );
}

/**
 * What the decision's `target` names, as the verb may aim at it: the user itself ("yourself"),
 * another agent, a thing here or another carried thing. Whether it is still alive, in sight and in
 * reach is checked separately, each time the verb moves on.
 */
export function resolveAim(
  state: WorldState,
  agentId: string,
  verb: Verb,
  targetName: string,
  usedEntityId: string | null,
): AimResolution {
  const wanted = normalizeDisplayName(targetName);
  if (canAimAtAgents(verb) && isSelfName(state, agentId, wanted)) {
    return verb.canTargetSelf
      ? { aim: { kind: "agent", agentId } }
      : { failure: `I can't ${verb.name} myself` };
  }
  const otherId = resolveName(targetName, listOthersAsSeen(state, agentId));
  if (otherId !== null && canAimAtAgents(verb)) return { aim: { kind: "agent", agentId: otherId } };
  const entity = canAimAtEntities(verb)
    ? findEntityByName(state, agentId, wanted, usedEntityId)
    : undefined;
  if (entity) return { aim: { kind: "entity", entityId: entity.id } };
  if (otherId !== null) return { failure: `I can't ${verb.name} a person` };
  return { failure: `there was no ${targetName} here` };
}

/** "Tobias", "the bakery door"; aimed at oneself, "themselves" to others and "myself" to oneself. */
export function describeAimName(
  state: WorldState,
  agentId: string,
  aim: VerbAim,
  perspective: AimPerspective = "others",
): string {
  if (aim.kind === "agent") {
    if (aim.agentId === agentId) {
      const words = config.verbs.selfTargetWords;
      return perspective === "user" ? words.own : words.others;
    }
    if (perspective === "target") return config.verbs.targetOwnWord;
    return describeAgentAsSeen(findAgent(state, aim.agentId));
  }
  const entity = findEntityIfPresent(state, aim.entityId);
  return entity ? `the ${describeEntityName(state, entity)}` : "it";
}

function findAimPosition(state: WorldState, aim: VerbAim): Position | null {
  if (aim.kind === "agent") return findAgent(state, aim.agentId).pos;
  const entity = findEntityIfPresent(state, aim.entityId);
  return entity ? (resolveEntityPosition(state, entity)?.pos ?? null) : null;
}

function isHeldBy(state: WorldState, aim: VerbAim, agentId: string): boolean {
  if (aim.kind === "agent") return aim.agentId === agentId;
  const location = findEntityIfPresent(state, aim.entityId)?.location;
  return location?.kind === "inventory" && location.agentId === agentId;
}

/**
 * Why the verb can't go on at its target right now, or null: a dead agent can't be aimed at, and
 * the target must still be there, in the user's sight, and not in someone else's hands.
 */
export function findAimProblem(state: WorldState, agentId: string, aim: VerbAim): string | null {
  if (isHeldBy(state, aim, agentId)) return null;
  if (aim.kind === "agent" && isDead(findAgent(state, aim.agentId))) {
    return `${findAgent(state, aim.agentId).name} was already dead`;
  }
  const name = describeAimName(state, agentId, aim);
  const entity = aim.kind === "entity" ? findEntityIfPresent(state, aim.entityId) : undefined;
  if (aim.kind === "entity" && !entity) return `${name} was gone`;
  if (entity?.location.kind === "inventory") return `someone else had ${name}`;
  const position = findAimPosition(state, aim);
  const user = findAgent(state, agentId);
  const isInSight =
    position !== null &&
    canSee(buildPerceptionWorld(state), user.pos, position, config.perception.sightRangeTiles);
  return isInSight ? null : `${name} was already gone`;
}

/** The verb's reach in tiles, read from what it is used with when the verb says so. */
export function computeVerbReach(
  state: WorldState,
  verb: Verb,
  usedDefinitionId: string | null,
): number {
  const definition =
    usedDefinitionId === null ? null : findDefinition(state.items, usedDefinitionId);
  return resolveNumber(verb.reach, definition);
}

/** Held things, and the user itself, are always in reach; anything else within `reach` tiles. */
export function isAimInReach(
  state: WorldState,
  agentId: string,
  aim: VerbAim,
  reachTiles: number,
): boolean {
  if (isHeldBy(state, aim, agentId)) return true;
  const position = findAimPosition(state, aim);
  if (position === null) return false;
  return computeChebyshevDistance(findAgent(state, agentId).pos, position) <= reachTiles;
}
