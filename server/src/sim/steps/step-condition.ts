import { matchesThing, type Matcher, type ThingView } from "@village/shared";
import { viewThing } from "../../items/things";
import { resolveMatcherReads, scopeOf } from "../../items/values";
import { findStepThings } from "./step-roles";
import type { StepRun } from "./step-run";

/** The things `on` names as they are now; when none is there any more, as last seen (eaten). */
function listJudgedViews(run: StepRun, on: string): ThingView[] {
  const { state } = run.context;
  const live = findStepThings(run, on).flatMap((thing) => viewThing(state, thing) ?? []);
  if (live.length > 0) return live;
  const snapshot = run.verbRun?.snapshots[on];
  return snapshot === undefined ? [] : [snapshot];
}

/**
 * Whether every thing `on` names matches the condition, as `check` and `if` judge it. Null when
 * that can't be judged before the verb runs: the condition reads, or `on` names, something not
 * picked yet. Once the verb runs, naming nothing doesn't match.
 */
export function judgeCondition(
  run: StepRun,
  on: string,
  condition: Matcher,
  isJudgedLate: boolean,
): boolean | null {
  const resolved = resolveMatcherReads(scopeOf(run), condition);
  if (!resolved.isFullyResolved && !isJudgedLate) return null;
  const views = listJudgedViews(run, on);
  if (views.length === 0) return isJudgedLate ? false : null;
  return views.every((view) => matchesThing(resolved.matcher, view));
}
