import type {
  Agent,
  LongTermGoal,
  Moment,
  MomentDetail,
  PersonalityChange,
  WorldEvent,
} from "@village/shared";
import { takeNextMomentId, type TickResult, type WorldState } from "./world-state";

type DistributiveOmit<Shape, Key extends keyof Shape> = Shape extends unknown
  ? Omit<Shape, Key>
  : never;

/** A moment before it gets an id. */
export type MomentDraft = DistributiveOmit<Moment, "id">;

type MomentSubject = Pick<Agent, "id" | "name">;

const FIELD_LABELS: Record<PersonalityChange["field"], string> = {
  extraversion: "extraversion",
  agreeableness: "agreeableness",
  conscientiousness: "conscientiousness",
  neuroticism: "neuroticism",
  openness: "openness",
  core: "sense of who they are",
  selfImage: "self-image",
  profession: "work",
};

function draftMoment(
  subject: MomentSubject,
  tick: number,
  text: string,
  detail: MomentDetail,
): MomentDraft {
  return { tick, agentId: subject.id, agentName: subject.name, text, ...detail };
}

function describePersonalityChange(change: Omit<PersonalityChange, "id">): string {
  const label = FIELD_LABELS[change.field];
  if (change.field === "profession") return `took up new work: ${change.newValue}`;
  if (change.field === "core" || change.field === "selfImage") return `rethought their ${label}`;
  const direction = Number(change.newValue) > Number(change.oldValue) ? "rose" : "fell";
  return `${label} ${direction} from ${change.oldValue} to ${change.newValue}`;
}

export function buildPersonalityMoments(
  subject: MomentSubject,
  changes: readonly Omit<PersonalityChange, "id">[],
): MomentDraft[] {
  return changes.map((change) =>
    draftMoment(subject, change.tick, describePersonalityChange(change), {
      kind: "personality_changed",
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      reason: change.reason,
    }),
  );
}

/**
 * Moments for the long-term goals a pass rewrote. Goals are matched by their text. A goal missing from the new list is reported as removed: the
 * reply doesn't say whether it was reached or given up, so neither is claimed.
 */
export function buildGoalMoments(
  subject: MomentSubject,
  tick: number,
  goalsBefore: readonly LongTermGoal[],
  goalsAfter: readonly LongTermGoal[],
): MomentDraft[] {
  const beforeByText = new Map(goalsBefore.map((goal) => [goal.goal, goal]));
  const afterTexts = new Set(goalsAfter.map((goal) => goal.goal));
  const moments: MomentDraft[] = [];
  for (const goal of goalsAfter) {
    const previous = beforeByText.get(goal.goal);
    if (!previous) {
      moments.push(
        draftMoment(subject, tick, `set a new goal: ${goal.goal}`, { kind: "goal_added", goal }),
      );
    } else if (previous.progress !== goal.progress) {
      moments.push(
        draftMoment(subject, tick, `made progress on "${goal.goal}": ${goal.progress}`, {
          kind: "goal_progressed",
          goal,
          previousProgress: previous.progress,
        }),
      );
    }
  }
  for (const goal of goalsBefore) {
    if (afterTexts.has(goal.goal)) continue;
    moments.push(
      draftMoment(subject, tick, `no longer has the goal: ${goal.goal}`, {
        kind: "goal_removed",
        goal,
      }),
    );
  }
  return moments;
}

export function buildFailureMoment(event: WorldEvent): MomentDraft | null {
  if (event.kind !== "action_failed") return null;
  const description = event.actorDescription ?? event.description;
  return draftMoment({ id: event.actorId, name: event.actorName }, event.tick, description, {
    kind: "action_failed",
    eventId: event.id,
    description,
  });
}

export function buildDeathMoment(subject: MomentSubject, tick: number, cause: string): MomentDraft {
  return draftMoment(subject, tick, `died: ${cause}`, { kind: "died", cause });
}

/** Gives each draft the next moment id and adds it to the tick's result. */
export function recordMoments(
  state: WorldState,
  result: TickResult,
  drafts: readonly (MomentDraft | null)[],
): void {
  for (const draft of drafts) {
    if (draft !== null) result.moments.push({ ...draft, id: takeNextMomentId(state) });
  }
}
