import {
  addComponentChange,
  findDefinition,
  parseComponentPath,
  readAgentHealth,
  removeComponentChange,
  writeFieldChange,
  type ComponentChanges,
  type ComponentValues,
  type FieldValue,
} from "@village/shared";
import { config } from "../config";
import { applyDamage, type HarmCause } from "../sim/damage";
import type { TickContext } from "../sim/tick-context";
import { findAgent, markAgentChanged, markEntityChanged, replaceAgent } from "../sim/world-access";
import { computeConditionEndTick } from "../status/conditions";
import { isDead } from "../status/health";
import { findEntityIfPresent, replaceEntity } from "./entity-store";
import { findThingDefinitionId, readThingChanges, type ThingRef } from "./things";

/*
 * The only code that changes a thing's components. Each operation turns the thing's changes into
 * new ones with the pure helpers in `shared/`, stores them and marks the thing changed.
 */

const NO_CAUSE: HarmCause = { killed: "", sourceAgentId: null };

function storeChanges(context: TickContext, thing: ThingRef, changes: ComponentChanges): void {
  const { state, result } = context;
  if (thing.kind === "agent") {
    replaceAgent(state, { ...findAgent(state, thing.agentId), bodyChanges: changes });
    markAgentChanged(result, thing.agentId);
    return;
  }
  const entity = findEntityIfPresent(state, thing.entityId);
  if (!entity) return;
  replaceEntity(state, { ...entity, changes });
  markEntityChanged(result, thing.entityId);
}

/** The thing's definition and changes, or null when it no longer exists. */
function readWritable(context: TickContext, thing: ThingRef) {
  const { state } = context;
  const changes = readThingChanges(state, thing);
  const definitionId = findThingDefinitionId(state, thing);
  if (changes === null || definitionId === null) return null;
  return { changes, definition: findDefinition(state.items, definitionId) };
}

function isAgentHealth(context: TickContext, thing: ThingRef, componentPath: string): boolean {
  return thing.kind === "agent" && componentPath === context.state.items.world.agentHealth;
}

/**
 * Writes one field, clamped to its `min` and `max`. Does nothing when the thing lacks the
 * component. An agent's health field is special: a dead agent's never changes, and lowering a
 * living agent's goes through `applyDamage` (waking, thresholds, death by `cause`).
 */
export function writeField(
  context: TickContext,
  thing: ThingRef,
  componentPath: string,
  value: FieldValue,
  cause: HarmCause = NO_CAUSE,
): void {
  const path = parseComponentPath(componentPath);
  if (path === null) throw new Error(`Bad component path "${componentPath}"`);
  if (thing.kind === "agent" && isAgentHealth(context, thing, componentPath)) {
    const agent = findAgent(context.state, thing.agentId);
    if (isDead(agent)) return;
    const health = readAgentHealth(context.state.items, agent);
    if (typeof value === "number" && value < health) {
      applyDamage(context, thing.agentId, { amount: health - value, ...cause });
      return;
    }
  }
  const writable = readWritable(context, thing);
  if (writable === null) return;
  const { declarations } = context.state.items;
  const changes = writeFieldChange(
    declarations,
    writable.definition,
    writable.changes,
    path,
    value,
  );
  if (changes !== writable.changes) storeChanges(context, thing, changes);
}

export interface ComponentAdding {
  /** Null: it lasts until removed. */
  minutes: number | null;
  fields?: ComponentValues;
  /** The agent behind whatever added it, for death causes. */
  sourceAgentId: string | null;
}

/**
 * Adds a component. One the thing already has keeps the later end and takes the newer source.
 * Returns whether it is new, or null when the thing no longer exists.
 */
export function addComponent(
  context: TickContext,
  thing: ThingRef,
  component: string,
  adding: ComponentAdding,
): boolean | null {
  const writable = readWritable(context, thing);
  if (writable === null) return null;
  const { state } = context;
  const addition = addComponentChange(
    state.items.declarations,
    writable.definition,
    writable.changes,
    component,
    {
      fields: adding.fields ?? {},
      endsAtTick: computeConditionEndTick(adding.minutes, state.tick, config.clock.minutesPerTick),
      sourceAgentId: adding.sourceAgentId,
    },
  );
  storeChanges(context, thing, addition.changes);
  return addition.isNew;
}

/** Removes a component. Returns whether the thing had it. */
export function removeComponent(context: TickContext, thing: ThingRef, component: string): boolean {
  const writable = readWritable(context, thing);
  if (writable === null) return false;
  const { state } = context;
  const before = readThingChanges(state, thing) ?? {};
  const changes = removeComponentChange(writable.definition, writable.changes, component);
  const hadComponent =
    before[component] !== null &&
    (Object.hasOwn(before, component) || Object.hasOwn(writable.definition.components, component));
  if (hadComponent) storeChanges(context, thing, changes);
  return hadComponent;
}

/** The entity becomes another definition where it is, untouched: changes and label cleared. */
export function replaceDefinition(
  context: TickContext,
  entityId: string,
  definitionId: string,
): void {
  const { state, result } = context;
  const entity = findEntityIfPresent(state, entityId);
  if (!entity) return;
  findDefinition(state.items, definitionId);
  replaceEntity(state, { ...entity, definitionId, label: null, changes: {} });
  markEntityChanged(result, entityId);
}
