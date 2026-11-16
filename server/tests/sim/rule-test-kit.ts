import type { Position } from "@village/shared";
import { createEntity } from "../../src/items/entity-store";
import { readComponents, type ThingRef } from "../../src/items/things";
import { config } from "../../src/config";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  buildCombatSim,
  contextOf,
  fixRolls,
  place,
} from "./combat-test-kit";
import { expireComponents, runEveryRules } from "../../src/sim/rule-timers";
import type { TestSim } from "../../src/sim/test-sim";
import type { TickResult } from "../../src/sim/world-state";

export const ALWAYS = 0;
export const NEVER = 0.99;
export const TOBIAS: ThingRef = { kind: "agent", agentId: "tobias" };
export const MARA: ThingRef = { kind: "agent", agentId: "mara" };
/** Away from the square's bench, board and the agents. */
export const OPEN_GROUND = { x: 23, y: 19 };
export const NEXT_TO_OPEN_GROUND = { x: 24, y: 19 };
export const TWO_FROM_OPEN_GROUND = { x: 25, y: 19 };

/** Mara and Tobias side by side on the square; every random roll comes out as `roll`. */
export function setUpRules(roll = NEVER): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  fixRolls(sim, roll);
  return sim;
}

export function placeThing(sim: TestSim, definitionId: string, pos: Position): ThingRef {
  const { place: map } = sim.agent("mara");
  const entity = createEntity(sim.state, definitionId, { kind: "tile", place: map, pos });
  return { kind: "entity", entityId: entity.id };
}

export function hasComponentNow(sim: TestSim, thing: ThingRef, component: string): boolean {
  return Object.hasOwn(readComponents(sim.state, thing) ?? {}, component);
}

/** Runs the mechanics this file owns for `count` ticks, returning each tick's result. */
export function runTicks(
  sim: TestSim,
  count: number,
  minutesPerTick = config.clock.minutesPerTick,
): TickResult[] {
  const results: TickResult[] = [];
  for (let tick = 0; tick < count; tick += 1) {
    sim.state.tick += 1;
    const context = contextOf(sim);
    expireComponents(context);
    runEveryRules(context, minutesPerTick);
    results.push(context.result);
  }
  return results;
}

export function describeEvents(results: readonly TickResult[]): string[] {
  return results.flatMap((result) => result.events.map((event) => event.description));
}
