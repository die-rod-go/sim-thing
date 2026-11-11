import { findDefinitionByName, type Effect, type Entity, type Verb } from "@village/shared";
import { listContents } from "../items/containers";
import { findEntityIfPresent, listHeldEntities } from "../items/entity-store";
import type { ChosenRequest, VerbRun } from "./agent-runtime";
import type { WorldState } from "./world-state";

export type ChosenResolution = { entityIds: string[] } | { failure: string };

/** Whether the verb moves or changes what the decision's `item` names (`put`, `take`, `drop`). */
export function hasChosenEffects(verb: Verb): boolean {
  return verb.effects.some((effect) => effect.on === "chosen");
}

function findChosenDestination(verb: Verb): Extract<Effect, { type: "move" }>["to"] | null {
  const move = verb.effects.find((effect) => effect.type === "move" && effect.on === "chosen");
  return move?.type === "move" ? move.to : null;
}

/** What the used thing holds: a container's contents or a body's belongings. */
export function listUsedContents(state: WorldState, run: VerbRun): Entity[] {
  if (run.usedBodyId !== undefined) return listHeldEntities(state, run.usedBodyId);
  return run.usedEntityId === null ? [] : listContents(state, run.usedEntityId);
}

function isInUsedThing(run: VerbRun, entity: Entity): boolean {
  const { location } = entity;
  if (location.kind === "inventory") return location.agentId === run.usedBodyId;
  return location.kind === "inside" && location.containerId === run.usedEntityId;
}

function isHeldByUser(run: VerbRun, entity: Entity): boolean {
  return entity.location.kind === "inventory" && entity.location.agentId === run.agentId;
}

/**
 * What the verb may choose from: the user's belongings and what the used thing holds, leaving out
 * whatever is already where the verb would move it. So `take` chooses from the chest and `put`
 * from the user's hands, with no verb named in code.
 */
export function listChosenPool(state: WorldState, run: VerbRun, verb: Verb): Entity[] {
  const destination = findChosenDestination(verb);
  const pool = [...listUsedContents(state, run), ...listHeldEntities(state, run.agentId)];
  return pool.filter((entity) => {
    if (destination === "user") return !isHeldByUser(run, entity);
    if (destination === "item") return !isInUsedThing(run, entity);
    return true;
  });
}

function findDefaultChosenName(state: WorldState, run: VerbRun): string | null {
  if (run.usedEntityId === null) return null;
  const used = findEntityIfPresent(state, run.usedEntityId);
  return used && isHeldByUser(run, used) ? used.definitionId : null;
}

/**
 * The entities the decision's `item` names, `amount` of them (oldest first), from the pool. A verb
 * used with something held (`drop`) chooses that thing when no item is named. Fewer than asked for
 * are chosen when that is all there is.
 */
export function chooseEntities(
  state: WorldState,
  run: VerbRun,
  verb: Verb,
  request: ChosenRequest | undefined,
): ChosenResolution {
  const name = request?.name ?? findDefaultChosenName(state, run);
  if (name === null) return { failure: `I didn't say what to ${verb.name}` };
  const definition = findDefinitionByName(state.items, name);
  const matching = definition
    ? listChosenPool(state, run, verb).filter((entity) => entity.definitionId === definition.id)
    : [];
  if (!definition || matching.length === 0) {
    return { failure: `there was no ${definition?.name ?? name} to ${verb.name}` };
  }
  const amount = request?.amount ?? 1;
  return { entityIds: matching.slice(0, amount).map((entity) => entity.id) };
}

/** The chosen entities still where they were chosen from, when the verb finishes. */
export function listStillChosen(state: WorldState, run: VerbRun, verb: Verb): string[] {
  const poolIds = new Set(listChosenPool(state, run, verb).map((entity) => entity.id));
  return (run.chosenEntityIds ?? []).filter((entityId) => poolIds.has(entityId));
}
