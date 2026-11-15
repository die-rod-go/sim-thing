import type { Moment, MomentKind } from "@village/shared";

export const MOMENT_GLYPHS: Record<MomentKind, string> = {
  personality_changed: "✦",
  goal_added: "⚑",
  goal_removed: "⚐",
  goal_progressed: "▸",
  action_failed: "✗",
  died: "✝",
};

export const MOMENT_LABELS: Record<MomentKind, string> = {
  personality_changed: "changed",
  goal_added: "new goal",
  goal_removed: "dropped or finished a goal",
  goal_progressed: "goal progress",
  action_failed: "failed",
  died: "died",
};

/**
 * Only the rare big beats reach the village story; everything else about one villager stays on
 * their sheet, so the story isn't flooded with routine.
 */
export function isStoryMoment(moment: Moment): boolean {
  return (
    moment.kind === "personality_changed" ||
    moment.kind === "died" ||
    moment.kind === "goal_added" ||
    moment.kind === "goal_removed"
  );
}

/** The longer text behind a moment's one-line summary, when it has one worth showing. */
export function describeMomentDetail(moment: Moment): string | null {
  switch (moment.kind) {
    case "personality_changed":
      return `${moment.oldValue} → ${moment.newValue}${moment.reason ? `, because ${moment.reason}` : ""}`;
    case "goal_added":
      return moment.goal.reason ? `because ${moment.goal.reason}` : null;
    case "goal_progressed":
      return moment.goal.progress || null;
    case "died":
      return moment.cause;
    case "goal_removed":
    case "action_failed":
      return null;
  }
}

/** Moments that arrived after `lastSeenId` and should pop up as a notification. */
export function selectToastMoments(moments: Moment[], lastSeenId: number): Moment[] {
  return moments.filter(
    (moment) => moment.id > lastSeenId && moment.kind === "personality_changed",
  );
}

export function findNewestMomentId(moments: Moment[]): number {
  return moments.reduce((newestId, moment) => Math.max(newestId, moment.id), 0);
}
