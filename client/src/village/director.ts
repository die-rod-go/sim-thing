import type { WorldEvent } from "@village/shared";
import { isThreadOngoing, type ConversationThread } from "../format/conversations";
import type { CameraFocusRequest } from "./camera-controller";

export interface DirectorWindow {
  currentTick: number;
  /** A thread counts as ongoing while its last line is at most this many ticks old. */
  maxGapTicks: number;
  /** Only lines this recent count toward how lively a conversation is. */
  recentWindowTicks: number;
}

function countRecentLines(thread: ConversationThread, earliestTick: number): number {
  return thread.entries.filter((entry) => entry.kind === "line" && entry.tick >= earliestTick)
    .length;
}

/** The ongoing conversation with the most recent lines; ties go to the one that spoke last. */
export function findLiveliestThread(
  threads: readonly ConversationThread[],
  conversationWindow: DirectorWindow,
): ConversationThread | null {
  const earliestTick = conversationWindow.currentTick - conversationWindow.recentWindowTicks;
  let liveliest: { thread: ConversationThread; lineCount: number } | null = null;
  for (const thread of threads) {
    if (!isThreadOngoing(thread, conversationWindow.currentTick, conversationWindow.maxGapTicks))
      continue;
    const lineCount = countRecentLines(thread, earliestTick);
    if (lineCount === 0) continue;
    const isLivelier =
      liveliest === null ||
      lineCount > liveliest.lineCount ||
      (lineCount === liveliest.lineCount && thread.endTick > liveliest.thread.endTick);
    if (isLivelier) liveliest = { thread, lineCount };
  }
  return liveliest?.thread ?? null;
}

/**
 * Where director mode points the camera next: the liveliest ongoing conversation's speakers, or
 * failing that whoever did the latest thing, or nowhere when nothing has happened.
 */
export function pickDirectorShot(
  threads: readonly ConversationThread[],
  events: readonly WorldEvent[],
  conversationWindow: DirectorWindow,
): CameraFocusRequest | null {
  const thread = findLiveliestThread(threads, conversationWindow);
  if (thread) return { kind: "agents", agentIds: thread.speakerIds };
  const latestEvent = events.reduce<WorldEvent | null>(
    (latest, event) => (latest === null || event.id > latest.id ? event : latest),
    null,
  );
  return latestEvent ? { kind: "agent", agentId: latestEvent.actorId } : null;
}
