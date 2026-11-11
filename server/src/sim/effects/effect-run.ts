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

/**
 * One list of effects being run: a verb's, or a condition's or reaction's. A verb's run knows
 * its user, item and target; a condition or reaction only knows `self`.
 */
export interface EffectRun {
  context: TickContext;
  /** Null for a condition's or a reaction's effects. */
  verb: Verb | null;
  run: VerbRun | null;
  /** Words from the decision, for verbs that take text (posting a note). */
  text: string;
  /** Minutes the decision chose, for a nap. */
  minutes?: number;
  /**
   * What `on: self` refers to: whatever carries the condition or reaction, or the entity breaking
   * while its `onBroken` effects run.
   */
  self?: EffectSubjectRef;
  /** The agent behind it: the verb's user, or whoever caused the condition or the chain. */
  sourceAgentId: string | null;
  /** How a death from a condition's or reaction's damage reads; verbs use their own phrase. */
  killed?: string;
  /** How many reactions deep this run is: 0 for a verb or a condition. */
  reactionDepth: number;
  /** The hit roll's `attacked` or `missed` event already showed what happens to the target. */
  isAttackAnnounced?: boolean;
  /** Whether the verb's hit roll hit; absent for a verb without one, which counts as a hit. */
  isHit?: boolean;
  /** These are `onBroken` effects, after the `broke` event was seen. */
  isBreakAnnounced?: boolean;
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
  const usedDefinitionId = effectRun.run?.usedDefinitionId ?? null;
  return usedDefinitionId === null
    ? null
    : findDefinition(effectRun.context.state.items, usedDefinitionId);
}

/** Who or what one effect works on. */
export type EffectSubjectRef =
  { kind: "agent"; agentId: string } | { kind: "entity"; entityId: string };

/** Names what runs the effects, for errors. */
export function describeEffectOwner(effectRun: EffectRun): string {
  return effectRun.verb === null ? "a condition or reaction" : `"${effectRun.verb.name}"`;
}

/** The verb run behind effects that only make sense in a verb (sleeping, producing for the user). */
export function requireVerbRun(effectRun: EffectRun, effect: Effect): VerbRun {
  if (effectRun.run === null) {
    throw new Error(
      `The ${effect.type} effect only works in verbs, not in ${describeEffectOwner(effectRun)}`,
    );
  }
  return effectRun.run;
}

/**
 * What the effect's `on` refers to in this run: the user, the thing used (an entity, or a body),
 * the verb's target, the first thing `chosen`, or `self`. Null when there is none, such as `item`
 * in a bare-handed verb. `nearby` is expanded into one run per subject before an effect gets here.
 */
export function findEffectSubject(effectRun: EffectRun, effect: Effect): EffectSubjectRef | null {
  const { run, self } = effectRun;
  switch (effect.on ?? "self") {
    case "user":
      return run === null ? null : { kind: "agent", agentId: run.agentId };
    case "item": {
      if (run?.usedBodyId !== undefined) return { kind: "agent", agentId: run.usedBodyId };
      const usedEntityId = run?.usedEntityId ?? null;
      return usedEntityId === null ? null : { kind: "entity", entityId: usedEntityId };
    }
    case "chosen": {
      const [firstId] = run?.chosenEntityIds ?? [];
      return firstId === undefined ? null : { kind: "entity", entityId: firstId };
    }
    case "target":
      return run?.aim ?? null;
    case "self":
      return self ?? null;
    default:
      throw new Error(
        `${describeEffectOwner(effectRun)}: ${effect.type} on ${effect.on} isn't built yet`,
      );
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
