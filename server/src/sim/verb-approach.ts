import type { InteractRequest } from "./agent-runtime";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { checkApproach } from "./verb-reach";
import { describeStartAttempt, resolveInteract } from "./verb-resolve";
import { startVerbRun } from "./verb-runner";
import { startWalk } from "./walk-start";

/**
 * Applies an interact: what the reply named is resolved now, since the reply was asked for a few
 * ticks ago. The verb starts at once when its item and target are in reach and the target in sight;
 * otherwise the agent walks to the item, then the target (following someone who moves), and it is
 * resolved again on the way.
 */
export function startOrApproachVerb(
  context: TickContext,
  agentId: string,
  request: InteractRequest,
): void {
  const { state, result } = context;
  const resolution = resolveInteract(state, agentId, request);
  if (resolution.kind === "failed") {
    failAction(state, result, agentId, resolution.attempt, resolution.reason);
    return;
  }
  const approach = checkApproach(state, agentId, resolution);
  if (approach.kind === "ready") {
    startVerbRun(context, agentId, resolution.start);
    return;
  }
  if (approach.isTargetOutOfSight) {
    failAction(state, result, agentId, describeStartAttempt(state, resolution), approach.reason);
    return;
  }
  startWalk(context, agentId, approach.destination, request);
}
