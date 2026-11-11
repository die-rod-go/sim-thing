import type { Moment, MomentKind } from "@village/shared";

export const MOMENT_GLYPHS: Record<MomentKind, string> = {
  personality_changed: "✦",
  goal_added: "⚑",
  goal_removed: "⚐",
  goal_progressed: "▸",
  daily_plan: "☀",
  reflection: "✎",
  action_failed: "✗",
};

export const MOMENT_LABELS: Record<MomentKind, string> = {
  personality_changed: "changed",
  goal_added: "new goal",
  goal_removed: "dropped or finished a goal",
  goal_progressed: "goal progress",
  daily_plan: "plan for the day",
  reflection: "reflection",
  action_failed: "failed",
};

/**
 * Only the rare big beats reach the village story; everything else about one villager stays on
 * their sheet, so the story isn't flooded with routine.
 */
export function isStoryMoment(moment: Moment): boolean {
  if (moment.kind === "reflection") return moment.pass === "weekly";
  return (
    moment.kind === "personality_changed" ||
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
      return moment.goal.why ? `because ${moment.goal.why}` : null;
    case "goal_progressed":
      return moment.goal.progress || null;
    case "daily_plan":
      return moment.plan;
    case "reflection":
      return moment.summary;
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

export interface DiaryEntry {
  momentId: number;
  tick: number;
  day: number;
  summary: string;
  moodEntry: string | null;
  insights: string[];
}

/** One agent's night reflections as a diary, newest first. */
export function buildDiary(
  moments: Moment[],
  agentId: string,
  dayOfTick: (tick: number) => number,
): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
  for (const moment of moments) {
    if (moment.agentId !== agentId || moment.kind !== "reflection" || moment.pass !== "night") {
      continue;
    }
    entries.push({
      momentId: moment.id,
      tick: moment.tick,
      day: dayOfTick(moment.tick),
      summary: moment.summary,
      moodEntry: moment.moodEntry,
      insights: moment.insights,
    });
  }
  return entries.sort(
    (first, second) => second.tick - first.tick || second.momentId - first.momentId,
  );
}
