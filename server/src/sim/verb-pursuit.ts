import { getAgentRuntime, type WalkDestination } from "./agent-runtime";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { checkApproach } from "./verb-reach";
import { describeStartAttempt, resolveInteract } from "./verb-resolve";
import { startVerbRun } from "./verb-runner";
import { computePath, retargetWalk } from "./walk-start";
import { findAgent } from "./world-access";

function isSameDestination(first: WalkDestination, second: WalkDestination): boolean {
  if (first.kind === "place" || second.kind === "place") return false;
  if (first.kind === "agent") return second.kind === "agent" && first.agentId === second.agentId;
  return second.kind === "entity" && first.entityId === second.entityId;
}

/**
 * On the way to a verb: everything is resolved again each tick, since things move. The verb starts
 * as soon as its item and target are in reach and the target in sight; it fails when what it
 * needed is gone or no longer fits, when a followed target has been chased for too long, or when
 * the path ends short. True when the walk is over.
 */
export function pursuePendingVerb(context: TickContext, agentId: string): boolean {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const walk = runtime.walk;
  const request = walk?.pendingVerb;
  if (!walk || !request) return false;
  const resolution = resolveInteract(state, agentId, request);
  if (resolution.kind === "failed") {
    failAction(state, result, agentId, resolution.attempt, resolution.reason);
    return true;
  }
  const approach = checkApproach(state, agentId, resolution);
  if (approach.kind === "ready") {
    runtime.walk = null;
    startVerbRun(context, agentId, resolution.start);
    return true;
  }
  if (!isSameDestination(approach.destination, walk.destination)) {
    retargetWalk(context, agentId, approach.destination);
    return true;
  }
  const hasGivenUp = walk.giveUpAtTick !== undefined && state.tick >= walk.giveUpAtTick;
  const isLost = walk.remainingSteps.length === 0 && walk.giveUpAtTick === undefined;
  if (hasGivenUp || isLost) {
    const reason = hasGivenUp ? `${resolution.start.targetName} got away` : approach.reason;
    failAction(state, result, agentId, describeStartAttempt(state, resolution), reason);
    return true;
  }
  if (walk.remainingSteps.length === 0) {
    walk.remainingSteps =
      computePath(state, agentId, findAgent(state, agentId).pos, walk.destination) ?? [];
  }
  return false;
}
