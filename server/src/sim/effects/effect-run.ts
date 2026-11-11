import type {
  Effect,
  EffectOfType,
  EffectType,
  Entity,
  ItemDefinition,
  Verb,
} from "@village/shared";
import { findDefinition } from "@village/shared";
import { describeEntityName, findEntityIfPresent } from "../../items/entity-store";
import type { VerbRun } from "../agent-runtime";
import type { TickContext } from "../tick-context";

/** One verb's effects being run: the tick, the verb, and what the decision supplied. */
export interface EffectRun {
  context: TickContext;
  verb: Verb;
  run: VerbRun;
  /** Words from the decision, for verbs that take text (posting a note). */
  text: string;
  /** Minutes the decision chose, for a nap. */
  minutes?: number;
}

export interface EffectOutcome {
  /** Items the effect made, for "finished baking bread, making 4 bread". */
  made?: { definitionId: string; count: number };
  /** The effect broadcast its own start event (fell asleep, posted a note). */
  isStartAnnounced?: boolean;
}

export interface EffectHandler<Type extends EffectType> {
  /** Why a `start` effect can't run right now; checked before the verb starts anything. */
  findBlocker?(effectRun: EffectRun, effect: EffectOfType<Type>): string | null;
  apply(effectRun: EffectRun, effect: EffectOfType<Type>): EffectOutcome;
}

export type EffectRegistry = { [Type in EffectType]?: EffectHandler<Type> };

/** The definition of the thing used, still known after a `start` effect used it up. */
export function findUsedDefinition(effectRun: EffectRun): ItemDefinition | null {
  const { usedDefinitionId } = effectRun.run;
  return usedDefinitionId === null
    ? null
    : findDefinition(effectRun.context.state.items, usedDefinitionId);
}

/**
 * The entity an effect works on. Only `on: item` is built so far; `chosen`, `target` and the rest
 * come with the verbs that need them. Undefined when the entity is already gone (eaten earlier).
 */
export function findEffectEntity(effectRun: EffectRun, effect: Effect): Entity | undefined {
  if (effect.on !== "item") {
    throw new Error(`"${effectRun.verb.name}": ${effect.type} on ${effect.on} isn't built yet`);
  }
  const { usedEntityId } = effectRun.run;
  if (usedEntityId === null) return undefined;
  return findEntityIfPresent(effectRun.context.state, usedEntityId);
}

/** The agent an effect works on. Only `on: user` is built so far. */
export function findEffectAgentId(effectRun: EffectRun, effect: Effect): string {
  if (effect.on !== "user") {
    throw new Error(`"${effectRun.verb.name}": ${effect.type} on ${effect.on} isn't built yet`);
  }
  return effectRun.run.agentId;
}

export function describeEffectEntity(effectRun: EffectRun, entity: Entity): string {
  return describeEntityName(effectRun.context.state, entity);
}
