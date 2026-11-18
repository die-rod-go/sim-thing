import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance } from "../economy/give";
import { canSee } from "../perception/sight";
import { isDead } from "../status/health";
import { FOLLOW_ACTION } from "./action-phrases";
import { getAgentRuntime, type WalkDestination } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { computePath } from "./walk-start";
import { stepOnce } from "./walking";
import {
  appendToStream,
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  findAgentBlockingTile,
  markAgentChanged,
  replaceAgent,
} from "./world-access";

const { minutesPerTick } = config.clock;

function fillName(template: string, name: string): string {
  return template.split("{name}").join(name);
}

/**
 * Sets out to keep within reach of someone in sight for a while, finding the way again as they
 * move. Others see it, the followed person most of all.
 */
export function startFollow(
  context: TickContext,
  agentId: string,
  act: { target: string; minutes: number },
): void {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const inSight = runtime.visibleAgentIds
    .map((otherId) => findAgent(state, otherId))
    .filter((other) => !isDead(other))
    .map((other) => ({ id: other.id, name: describeAgentAsSeen(other) }));
  const followedId = resolveName(act.target, inSight);
  if (followedId === null) {
    failAction(state, result, agentId, `follow ${act.target}`, config.walking.followNoOneReason);
    return;
  }
  const followed = findAgent(state, followedId);
  const ticks = Math.max(1, Math.ceil(act.minutes / minutesPerTick));
  const following = {
    ...findAgent(state, agentId),
    currentAction: { kind: FOLLOW_ACTION, target: followed.name, endsAtTick: state.tick + ticks },
  };
  replaceAgent(state, following);
  runtime.follow = { agentId: followedId, ticksOutOfSight: 0, lastSeenPos: { ...followed.pos } };
  markAgentChanged(result, agentId);
  const event = createEvent(state, following, {
    kind: "walk_started",
    description: fillName(config.walking.followStartedText, followed.name),
    targetId: followedId,
    targetName: followed.name,
  });
  broadcastEvent(state, event, result);
}

function endFollow(context: TickContext, agentId: string): void {
  getAgentRuntime(context.state, agentId).follow = null;
  replaceAgent(context.state, { ...findAgent(context.state, agentId), currentAction: null });
  markAgentChanged(context.result, agentId);
}

function stepTowards(context: TickContext, agentId: string, destination: WalkDestination): void {
  const { state } = context;
  const follower = findAgent(state, agentId);
  const nextStep = computePath(state, agentId, follower.pos, destination)?.[0];
  if (nextStep === undefined || findAgentBlockingTile(state, agentId, nextStep)) return;
  stepOnce(context, agentId, nextStep);
}

/**
 * One tick of following: the follow ends when its time is up, when the followed person dies, or
 * when they have been out of sight for `walking.followLostTicks`. Out of sight, the follower goes
 * on to where they were last seen (through the door they went in by); in sight, it steps towards
 * them unless already within reach, or someone stands in the way.
 */
export function advanceFollow(context: TickContext, agentId: string): void {
  const { state } = context;
  const follower = findAgent(state, agentId);
  const follow = getAgentRuntime(state, agentId).follow;
  const endsAtTick = follower.currentAction?.endsAtTick ?? null;
  if (follow === null || (endsAtTick !== null && state.tick >= endsAtTick)) {
    endFollow(context, agentId);
    return;
  }
  const followed = findAgent(state, follow.agentId);
  if (isDead(followed)) {
    endFollow(context, agentId);
    return;
  }
  const world = buildPerceptionWorld(state);
  if (!canSee(world, follower.pos, followed.pos, config.perception.sightRangeTiles)) {
    follow.ticksOutOfSight += 1;
    if (follow.ticksOutOfSight < config.walking.followLostTicks) {
      const lastSeen = { kind: "tile" as const, pos: follow.lastSeenPos, name: followed.name };
      stepTowards(context, agentId, lastSeen);
      return;
    }
    appendToStream(state, agentId, fillName(config.walking.followLostText, followed.name));
    endFollow(context, agentId);
    return;
  }
  follow.ticksOutOfSight = 0;
  follow.lastSeenPos = { ...followed.pos };
  if (computeChebyshevDistance(follower.pos, followed.pos) <= config.economy.giveReachTiles) return;
  stepTowards(context, agentId, { kind: "agent", agentId: followed.id });
}
