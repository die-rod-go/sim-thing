import type { Position } from "@village/shared";

/** A marker gliding in a straight line between two pixel positions. */
export interface AgentMotion {
  from: Position;
  to: Position;
  startMs: number;
  durationMs: number;
}

export function computeMotionPosition(motion: AgentMotion, nowMs: number): Position {
  if (motion.durationMs <= 0) return motion.to;
  const progress = Math.min(Math.max((nowMs - motion.startMs) / motion.durationMs, 0), 1);
  return {
    x: motion.from.x + (motion.to.x - motion.from.x) * progress,
    y: motion.from.y + (motion.to.y - motion.from.y) * progress,
  };
}

/** Starts a glide to the new target from wherever the marker is right now. */
export function retargetMotion(
  motion: AgentMotion | undefined,
  target: Position,
  nowMs: number,
  durationMs: number,
): AgentMotion {
  if (!motion) return { from: target, to: target, startMs: nowMs, durationMs: 0 };
  if (motion.to.x === target.x && motion.to.y === target.y) return motion;
  return { from: computeMotionPosition(motion, nowMs), to: target, startMs: nowMs, durationMs };
}
