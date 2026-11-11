import type { Entity } from "@village/shared";
import { describeEntityName, findEntityIfPresent } from "../../items/entity-store";
import { readComponents, type ThingRef } from "../../items/things";
import { findScopeThing, scopeOf } from "../../items/values";
import type { ThingSnapshot, VerbRun } from "../agent-runtime";
import type { RuleCause } from "../rule-cause";
import type { WorldState } from "../world-state";
import type { StepRun } from "./step-run";

/** The live thing a role or `as` name stands for; `item` is the first of the stack still present. */
export function findRoleThing(run: StepRun, name: string): ThingRef | null {
  return findScopeThing(scopeOf(run), name);
}

/** Every thing a step's `on` gives: the whole stack for `item`, otherwise one or none. */
export function findStepThings(run: StepRun, name: string): ThingRef[] {
  const { verbRun } = run;
  if (name === "item" && verbRun !== null) {
    const { state } = run.context;
    return verbRun.itemIds
      .filter((entityId) => findEntityIfPresent(state, entityId))
      .map((entityId): ThingRef => ({ kind: "entity", entityId }));
  }
  const thing = findRoleThing(run, name);
  return thing === null ? [] : [thing];
}

/** The entities among a step's things: bodies are skipped by steps that only move or remove entities. */
export function findStepEntities(run: StepRun, name: string): Entity[] {
  const { state } = run.context;
  return findStepThings(run, name).flatMap((thing) => {
    const entity = thing.kind === "entity" ? findEntityIfPresent(state, thing.entityId) : undefined;
    return entity ? [entity] : [];
  });
}

export function snapshotThing(state: WorldState, thing: ThingRef): ThingSnapshot | null {
  const components = readComponents(state, thing);
  if (components === null) return null;
  if (thing.kind === "agent") {
    const agent = state.agents.find((candidate) => candidate.id === thing.agentId);
    return agent
      ? { definitionId: state.items.world.agentBody, name: agent.name, components }
      : null;
  }
  const entity = findEntityIfPresent(state, thing.entityId);
  if (!entity) return null;
  return {
    definitionId: entity.definitionId,
    name: describeEntityName(state, entity),
    components,
  };
}

function remember(state: WorldState, verbRun: VerbRun, name: string, thing: ThingRef | null): void {
  const snapshot = thing === null ? null : snapshotThing(state, thing);
  if (snapshot !== null) verbRun.snapshots[name] = snapshot;
}

/** Updates the snapshots of `item`, `target` and each `as` name that are still present. */
export function refreshSnapshots(state: WorldState, verbRun: VerbRun): void {
  const presentItemId = verbRun.itemIds.find((entityId) => findEntityIfPresent(state, entityId));
  remember(
    state,
    verbRun,
    "item",
    presentItemId === undefined ? null : { kind: "entity", entityId: presentItemId },
  );
  remember(state, verbRun, "target", verbRun.target);
  for (const [name, entityId] of Object.entries(verbRun.namedIds)) {
    remember(state, verbRun, name, { kind: "entity", entityId });
  }
}

/** What a write made by this run carries: who is behind it, how a death reads, how deep it is. */
export function describeRunCause(run: StepRun): RuleCause {
  return { killed: run.killedPhrase, sourceAgentId: run.sourceAgentId, depth: run.depth };
}

/** The verb run behind steps that only make sense in a verb. */
export function requireVerbRun(run: StepRun, stepType: string): VerbRun {
  if (run.verbRun === null)
    throw new Error(`The ${stepType} step only works in verbs, not in a rule`);
  return run.verbRun;
}

/** Records entities this verb moved or destroyed, which needn't be where they were. */
export function recordTouched(run: StepRun, entityIds: readonly string[]): void {
  if (run.verbRun === null) return;
  for (const entityId of entityIds) {
    if (!run.verbRun.touchedIds.includes(entityId)) run.verbRun.touchedIds.push(entityId);
  }
}
