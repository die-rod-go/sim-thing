import { moveEntity, createEntity } from "../../items/entity-store";
import { replaceDefinition, writeField } from "../../items/thing-writes";
import { resolveDefinitionId, resolveFieldInput, resolveNumber, scopeOf } from "../../items/values";
import { isDead } from "../../status/health";
import { placeBody } from "../carried-bodies";
import { findAgent, markEntityChanged } from "../world-access";
import { findBodyPlacementRefusal, findDestination, findPlacementRefusal } from "./destination";
import { destroyEntities, replaceBody } from "./step-entities";
import {
  describeRunCause,
  findStepEntities,
  findStepThings,
  nameEntity,
  recordTouched,
  refreshSnapshots,
} from "./step-roles";
import { DONE, type StepHandler, type StepOutcome, type StepRun } from "./step-run";
import type { StepOfType } from "@village/shared";

type MoveStep = StepOfType<"move">;

/** The dead agents among the role's things: a living body is left where it stands. */
function listMovedBodyIds(run: StepRun, step: MoveStep): string[] {
  const { state } = run.context;
  return findStepThings(run, step.on ?? "self").flatMap((thing) =>
    thing.kind === "agent" && isDead(findAgent(state, thing.agentId)) ? [thing.agentId] : [],
  );
}

function findMoveRefusal(run: StepRun, step: MoveStep): string | null {
  const moved = findStepEntities(run, step.on ?? "self");
  const bodyIds = listMovedBodyIds(run, step);
  const destination = findDestination(run, step);
  if (destination === null) return null;
  const entityRefusal =
    moved.length > 0 ? findPlacementRefusal(run, step, destination, moved) : null;
  return entityRefusal ?? findBodyPlacementRefusal(run, step, destination, bodyIds);
}

/**
 * Moves every entity, and dead agent's body, the role gives inside a thing or onto its tile; never
 * into itself, nor entities over `limit`.
 */
export const moveStep: StepHandler<"move"> = {
  isVerbOnly: false,
  findRefusal: findMoveRefusal,
  run(run, step): StepOutcome {
    const refusal = findMoveRefusal(run, step);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    const moved = findStepEntities(run, step.on ?? "self");
    const bodyIds = listMovedBodyIds(run, step);
    const destination = findDestination(run, step);
    if (destination === null) return DONE;
    const { state, result } = run.context;
    for (const entity of moved) {
      moveEntity(state, entity.id, destination.location);
      markEntityChanged(result, entity.id);
    }
    for (const bodyId of bodyIds) placeBody(run.context, bodyId, destination.location);
    recordTouched(
      run,
      moved.map((entity) => entity.id),
    );
    return DONE;
  },
};

type CreateStep = StepOfType<"create">;

function countCreations(run: StepRun, step: CreateStep): number {
  return Math.max(0, Math.round(resolveNumber(scopeOf(run), step.count)));
}

function findCreateRefusal(run: StepRun, step: CreateStep): string | null {
  if (step.limit === undefined) return null;
  const destination = findDestination(run, step);
  if (destination === null) return null;
  return findPlacementRefusal(run, step, destination, [], countCreations(run, step));
}

/**
 * Makes `count` new entities of a definition inside a thing or on its tile, with `fields` written
 * on each (a `newId` gives each its own). The first takes the `as` name.
 */
export const createStep: StepHandler<"create"> = {
  isVerbOnly: false,
  findRefusal: findCreateRefusal,
  run(run, step): StepOutcome {
    const refusal = findCreateRefusal(run, step);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    const destination = findDestination(run, step);
    const scope = scopeOf(run);
    const definitionId = resolveDefinitionId(scope, step.item);
    const count = countCreations(run, step);
    if (destination === null) return DONE;
    const { state, result } = run.context;
    for (let made = 0; made < count; made += 1) {
      const entity = createEntity(state, definitionId, destination.location);
      markEntityChanged(result, entity.id);
      if (made === 0) nameEntity(run, step.as, entity);
      const thing = { kind: "entity", entityId: entity.id } as const;
      for (const [path, input] of Object.entries(step.fields ?? {})) {
        writeField(
          run.context,
          thing,
          path,
          resolveFieldInput(scope, input),
          describeRunCause(run),
        );
      }
    }
    return { kind: "done", made: { definitionId, count } };
  },
};

/**
 * An entity becomes another definition where it is. A dead agent's body becomes an entity of it on
 * its tile, dropping what it carried, and leaves the world (a burial); a living body stays as it is.
 */
export const transformStep: StepHandler<"transform"> = {
  isVerbOnly: false,
  run(run, step) {
    const definitionId = resolveDefinitionId(scopeOf(run), step.into);
    const things = findStepThings(run, step.on ?? "self");
    if (run.verbRun !== null) refreshSnapshots(run.context.state, run.verbRun);
    const count = things.filter((thing) =>
      thing.kind === "agent"
        ? replaceBody(run.context, thing.agentId, definitionId)
        : replaceDefinition(run.context, thing.entityId, definitionId),
    ).length;
    recordTouched(
      run,
      things.flatMap((thing) => (thing.kind === "entity" ? [thing.entityId] : [])),
    );
    return { kind: "done", made: { definitionId, count } };
  },
};

/** Removes the entities for good (eating the bread); what was inside goes to where it was. */
export const destroyStep: StepHandler<"destroy"> = {
  isVerbOnly: false,
  run(run, step) {
    const entities = findStepEntities(run, step.on ?? "self");
    if (run.verbRun !== null) refreshSnapshots(run.context.state, run.verbRun);
    destroyEntities(run, entities);
    return DONE;
  },
};
