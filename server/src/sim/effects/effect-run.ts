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
import { isDead } from "../../status/health";
import type { TickContext } from "../tick-context";
import { findAgent } from "../world-access";

/** One verb's effects being run: the tick, the verb, and what the decision supplied. */
export interface EffectRun {
  context: TickContext;
  verb: Verb;
  run: VerbRun;
  /** Words from the decision, for verbs that take text (posting a note). */
  text: string;
  /** Minutes the decision chose, for a nap. */
  minutes?: number;
  /** The entity `on: self` refers to: the one breaking, while its `onBroken` effects run. */
  selfEntityId?: string;
  /** The hit roll's `attacked` or `missed` event already showed what happens to the target. */
  isAttackAnnounced?: boolean;
  /** Whether the verb's hit roll hit; absent for a verb without one, which counts as a hit. */
  isHit?: boolean;
}

export interface EffectOutcome {
  /** Items the effect made, for "finished baking bread, making 4 bread". */
  made?: { definitionId: string; count: number };
  /** The effect broadcast its own start event (fell asleep, posted a note). */
  isStartAnnounced?: boolean;
  /** The effect broadcast its own finish event (dropped a knife, took 5 coins). */
  isFinishAnnounced?: boolean;
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

/** Who or what one effect works on. */
export type EffectSubjectRef =
  { kind: "agent"; agentId: string } | { kind: "entity"; entityId: string };

/**
 * What the effect's `on` refers to in this run: the user, the thing used (an entity, or a body),
 * the verb's target, the first thing `chosen`, or `self` (the entity breaking, for `onBroken`).
 * Null when there is none, such as `item` in a bare-handed verb. `nearby` comes with the phase
 * that needs it; the server refuses an `items.json` that uses it before then.
 */
export function findEffectSubject(effectRun: EffectRun, effect: Effect): EffectSubjectRef | null {
  const { run, selfEntityId } = effectRun;
  switch (effect.on ?? "self") {
    case "user":
      return { kind: "agent", agentId: run.agentId };
    case "item":
      if (run.usedBodyId !== undefined) return { kind: "agent", agentId: run.usedBodyId };
      return run.usedEntityId === null ? null : { kind: "entity", entityId: run.usedEntityId };
    case "chosen": {
      const [firstId] = run.chosenEntityIds ?? [];
      return firstId === undefined ? null : { kind: "entity", entityId: firstId };
    }
    case "target":
      return run.aim ?? null;
    case "self":
      return selfEntityId === undefined ? null : { kind: "entity", entityId: selfEntityId };
    default:
      throw new Error(`"${effectRun.verb.name}": ${effect.type} on ${effect.on} isn't built yet`);
  }
}

/** The entity an effect works on; undefined when it is an agent, or already gone (eaten earlier). */
export function findEffectEntity(effectRun: EffectRun, effect: Effect): Entity | undefined {
  const subject = findEffectSubject(effectRun, effect);
  if (subject?.kind !== "entity") return undefined;
  return findEntityIfPresent(effectRun.context.state, subject.entityId);
}

/** The living agent an effect works on, or null when it works on a thing or on the dead. */
export function findEffectAgentId(effectRun: EffectRun, effect: Effect): string | null {
  const subject = findEffectSubject(effectRun, effect);
  if (subject?.kind !== "agent") return null;
  return isDead(findAgent(effectRun.context.state, subject.agentId)) ? null : subject.agentId;
}

export function describeEffectEntity(effectRun: EffectRun, entity: Entity): string {
  return describeEntityName(effectRun.context.state, entity);
}
