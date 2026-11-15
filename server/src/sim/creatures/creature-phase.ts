import {
  isBareHanded,
  matchesAppliesTo,
  matchesThing,
  type Entity,
  type Instinct,
  type InstinctOfKind,
  type Matcher,
  type Verb,
} from "@village/shared";
import { describeEntityName, findEntityIfPresent } from "../../items/entity-store";
import { isSameThing, viewThing, type ThingRef } from "../../items/things";
import { resolveMatcherReads, resolveNumber, type ValueScope } from "../../items/values";
import { normalizeVerbName } from "../../items/verb-offers";
import type { PerceptionWorld } from "../../perception/types";
import type { TileGrid } from "../../world/types";
import type { TickContext } from "../tick-context";
import { viewThingFrom } from "../thing-where";
import { buildVerbRun, resumeRunningVerb, startVerbRun, type VerbStart } from "../verb-runner";
import { describeTargetName } from "../verb-target";
import { buildPerceptionWorld, buildWalkingGrid } from "../world-access";
import type { WorldState } from "../world-state";
import { findRecentAttacker } from "./creature-attacks";
import {
  isCreature,
  listApplicableInstincts,
  listCreatures,
  viewCreatureAsSelf,
} from "./creature-instincts";
import { listTilesWithinReach, stepAtRandom, stepAway, stepTowardAny } from "./creature-moves";
import { listSeenThings, type SeenThing } from "./creature-sight";

/** What one creature works with this tick. */
interface CreatureTurn {
  context: TickContext;
  grid: TileGrid;
  creature: Entity;
  seen: SeenThing[];
}

/**
 * The verb of that name the creature does: one done with its own body (`appliesTo` meets it as
 * `self`) before a bare-handed one. -1 when it has none.
 */
function findCreatureVerbIndex(state: WorldState, creature: Entity, verbName: string): number {
  const wanted = normalizeVerbName(verbName);
  const view = viewCreatureAsSelf(state, creature);
  const verbs = state.items.verbs;
  const isNamed = (verb: Verb) => normalizeVerbName(verb.name) === wanted;
  const ownBodyIndex = verbs.findIndex((verb) => isNamed(verb) && matchesAppliesTo(verb, view));
  if (ownBodyIndex !== -1) return ownBodyIndex;
  return verbs.findIndex((verb) => isNamed(verb) && isBareHanded(verb));
}

function buildStart(
  state: WorldState,
  creature: Entity,
  verbIndex: number,
  target: ThingRef | null,
): VerbStart {
  const verb = state.items.verbs[verbIndex];
  const isOwnBody = verb !== undefined && !isBareHanded(verb);
  return {
    verbIndex,
    itemIds: isOwnBody ? [creature.id] : [],
    itemName: isOwnBody ? describeEntityName(state, creature) : "",
    from: null,
    target,
    targetName: target === null ? null : describeTargetName(state, creature.id, target),
    choice: { amount: 1 },
  };
}

/** Reads in the verb's settings (`item.range.tiles`) resolved as if the verb were starting. */
function buildProvisionalScope(state: WorldState, creature: Entity, verbIndex: number): ValueScope {
  const verbRun = buildVerbRun(state, creature.id, buildStart(state, creature, verbIndex, null));
  return { state, verbRun, self: null };
}

function matchesFromCreature(
  state: WorldState,
  creature: Entity,
  thing: ThingRef,
  matchers: readonly Matcher[],
): boolean {
  const view = viewThingFrom(state, creature.id, thing);
  return view !== null && matchers.every((matcher) => matchesThing(matcher, view));
}

/** What the instinct could go for, nearest first: fitting the verb's target and its own. */
function listInstinctTargets(
  turn: CreatureTurn,
  instinct: InstinctOfKind<"verb">,
  verbTarget: Matcher,
): SeenThing[] {
  const { state } = turn.context;
  const matchers = instinct.target === undefined ? [verbTarget] : [verbTarget, instinct.target];
  const attacker = instinct.isRetaliation ? findRecentAttacker(state, turn.creature.id) : null;
  if (instinct.isRetaliation && attacker === null) return [];
  return turn.seen.filter(
    (seen) =>
      (attacker === null || isSameThing(seen.thing, attacker)) &&
      matchesFromCreature(state, turn.creature, seen.thing, matchers),
  );
}

/** Does the verb to the nearest fitting thing in reach, or steps toward the nearest it can reach. */
function followVerbInstinct(turn: CreatureTurn, instinct: InstinctOfKind<"verb">): boolean {
  const { context, creature, grid } = turn;
  const { state } = context;
  const verbIndex = findCreatureVerbIndex(state, creature, instinct.verb);
  const verb = state.items.verbs[verbIndex];
  if (verb === undefined) return false;
  if (verb.target === undefined) {
    startVerbRun(context, creature.id, buildStart(state, creature, verbIndex, null));
    return true;
  }
  const scope = buildProvisionalScope(state, creature, verbIndex);
  const verbTarget = resolveMatcherReads(scope, verb.target).matcher;
  const reach = resolveNumber(scope, verb.reach);
  for (const candidate of listInstinctTargets(turn, instinct, verbTarget)) {
    if (candidate.distance <= reach) {
      startVerbRun(context, creature.id, buildStart(state, creature, verbIndex, candidate.thing));
      return true;
    }
    if (stepTowardAny(context, grid, creature, listTilesWithinReach(grid, candidate.pos, reach))) {
      return true;
    }
  }
  return false;
}

function followFleeInstinct(turn: CreatureTurn, instinct: InstinctOfKind<"flee">): boolean {
  const { state } = turn.context;
  const threats = turn.seen.filter((seen) => {
    const view = viewThing(state, seen.thing);
    return seen.distance <= instinct.radius && view !== null && matchesThing(instinct.from, view);
  });
  if (threats.length === 0) return false;
  const threatTiles = threats.map((threat) => threat.pos);
  stepAway(turn.context, turn.grid, turn.creature, threatTiles);
  return true;
}

/** Whether the instinct found something to do; if not, the next one is tried. */
function followInstinct(turn: CreatureTurn, instinct: Instinct): boolean {
  if (instinct.do === "verb") return followVerbInstinct(turn, instinct);
  if (instinct.do === "flee") return followFleeInstinct(turn, instinct);
  if (turn.context.state.random.next() < instinct.chance) {
    stepAtRandom(turn.context, turn.grid, turn.creature);
  }
  return true;
}

/** A creature busy with a verb carries on with it; otherwise its first instinct that can act does. */
function actCreature(
  context: TickContext,
  world: PerceptionWorld,
  grid: TileGrid,
  creature: Entity,
): void {
  const { state } = context;
  const runtime = state.creatureRuntimes[creature.id];
  if (runtime?.verbRun) {
    const isWaitOver = runtime.resumeAtTick !== null && state.tick >= runtime.resumeAtTick;
    if (isWaitOver) resumeRunningVerb(context, creature.id);
    return;
  }
  const turn: CreatureTurn = {
    context,
    grid,
    creature,
    seen: listSeenThings(state, world, creature),
  };
  for (const instinct of listApplicableInstincts(state, creature)) {
    if (followInstinct(turn, instinct)) return;
  }
}

function forgetGoneCreatures(state: WorldState): void {
  for (const entityId of Object.keys(state.creatureRuntimes)) {
    if (!findEntityIfPresent(state, entityId)) delete state.creatureRuntimes[entityId];
  }
}

/**
 * Every creature acts on its instincts, in entity order. One that an earlier creature's verb
 * destroyed or changed into something else is skipped.
 */
export function actCreatures(context: TickContext): void {
  const { state } = context;
  forgetGoneCreatures(state);
  const creatures = listCreatures(state);
  if (creatures.length === 0) return;
  const world = buildPerceptionWorld(state);
  const grid = buildWalkingGrid(state);
  for (const { id } of creatures) {
    const creature = findEntityIfPresent(state, id);
    if (creature && isCreature(state, creature)) actCreature(context, world, grid, creature);
  }
}
