import { resolveNumber } from "../items/values";
import { locateThing, type ThingRef } from "../items/things";
import type { WalkDestination } from "./agent-runtime";
import { isThingInReach, isThingInSight } from "./thing-where";
import type { ReadyInteract } from "./verb-resolve";
import { buildVerbRun } from "./verb-runner";
import type { WorldState } from "./world-state";

/** Whether a resolved verb can start where the agent stands, or where it must go first. */
export type Approach =
  | { kind: "ready" }
  | {
      kind: "approach";
      /** The item or target to go to; the item comes first. */
      destination: WalkDestination;
      reason: string;
      /** The target can't be seen, which a verb that hasn't started yet doesn't wait for. */
      isTargetOutOfSight: boolean;
    };

function toDestination(thing: ThingRef): WalkDestination {
  return thing.kind === "agent"
    ? { kind: "agent", agentId: thing.agentId }
    : { kind: "entity", entityId: thing.entityId };
}

/** Where to walk to reach the item: a body it is inside, or the item itself. */
function findItemDestination(ready: ReadyInteract): WalkDestination {
  const { from, itemIds } = ready.start;
  if (from?.kind === "agent") return toDestination(from);
  return { kind: "entity", entityId: itemIds[0] ?? "" };
}

/**
 * The item must be within `reach` tiles (carried things always are; one inside something is where
 * its holder is), and the target in sight and within reach. The item comes first.
 */
export function checkApproach(state: WorldState, agentId: string, ready: ReadyInteract): Approach {
  const { start, verb } = ready;
  const scope = { state, verbRun: buildVerbRun(state, agentId, start), self: null };
  const reach = resolveNumber(scope, verb.reach);
  const [itemId] = start.itemIds;
  if (itemId !== undefined) {
    const item: ThingRef = { kind: "entity", entityId: itemId };
    if (!isThingInReach(state, agentId, item, reach)) {
      return {
        kind: "approach",
        destination: findItemDestination(ready),
        reason: `the ${start.itemName} was out of reach`,
        isTargetOutOfSight: false,
      };
    }
  }
  const { target, targetName } = start;
  if (target === null || locateThing(state, target) === null) return { kind: "ready" };
  const name = targetName ?? "it";
  const isInSight = isThingInSight(state, agentId, target);
  if (isInSight && isThingInReach(state, agentId, target, reach)) return { kind: "ready" };
  return {
    kind: "approach",
    destination: toDestination(target),
    reason: isInSight ? `${name} was out of reach` : `${name} was out of sight`,
    isTargetOutOfSight: !isInSight,
  };
}
