import type { Moment } from "@village/shared";
import type {
  ActivityAction,
  ActivityFailures,
  ActivityMoment,
  ActivitySpeech,
  ActivityThought,
} from "./agent-activity";

/** Fewer failures in a row than this show one by one. */
const MIN_FOLDED_FAILURES = 2;

/** Two or more failures in a row, with nothing else the agent did between them, fold into one. */
export function foldFailures(actions: ActivityAction[]): (ActivityAction | ActivityFailures)[] {
  const folded: (ActivityAction | ActivityFailures)[] = [];
  let run: ActivityAction[] = [];
  const flushRun = () => {
    const lastFailure = run[run.length - 1];
    if (lastFailure && run.length >= MIN_FOLDED_FAILURES) {
      folded.push({
        kind: "failures",
        key: `failures-${lastFailure.key}`,
        tick: lastFailure.tick,
        failures: run,
      });
    } else {
      folded.push(...run);
    }
    run = [];
  };
  for (const action of actions) {
    if (action.eventKind === "action_failed") {
      run.push(action);
      continue;
    }
    flushRun();
    folded.push(action);
  }
  flushRun();
  return folded;
}

/**
 * The agent's moments, minus ones the timeline already shows another way: failures appear as
 * events, and a reflection whose LLM call is listed appears as that thought.
 */
export function collectMoments(
  agentId: string,
  moments: Moment[],
  thoughtItems: ActivityThought[],
): ActivityMoment[] {
  return moments
    .filter((moment) => moment.agentId === agentId && moment.kind !== "action_failed")
    .filter(
      (moment) =>
        moment.kind !== "reflection" ||
        !thoughtItems.some((item) => item.thoughtKind === moment.pass && item.tick === moment.tick),
    )
    .map((moment) => ({ kind: "moment", key: `moment-${moment.id}`, tick: moment.tick, moment }));
}

/** Puts each line beside the decision that produced it, when that decision is in the timeline. */
export function pairSpeechWithThoughts(
  speech: ActivitySpeech[],
  thoughtItems: ActivityThought[],
): ActivitySpeech[] {
  const thoughtTickByKey = new Map(thoughtItems.map((item) => [item.key, item.tick]));
  return speech.map((item) => {
    const thoughtTick =
      item.llmCallId === null ? undefined : thoughtTickByKey.get(`call-${item.llmCallId}`);
    return thoughtTick === undefined
      ? item
      : { ...item, tick: thoughtTick, isThoughtShownAbove: true };
  });
}
