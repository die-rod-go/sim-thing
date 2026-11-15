import type { Verb } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { resolveNumber, scopeOf } from "../items/values";
import {
  describeFromName,
  describeItemCounts,
  describeOngoingVerb,
  describeVerbPhrase,
  type PhraseNames,
} from "./action-phrases";
import type { VerbRun } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import type { StepRun } from "./steps/step-run";
import { addSlowFinish } from "./verb-slowdown";
import { createUserEvent } from "./verb-user";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** An event's description, and how the user and the target agent each file it when that differs. */
interface AimedPhrases {
  description: string;
  actorDescription?: string;
  targetDescription?: string;
}

function describeNames(state: WorldState, verbRun: VerbRun): PhraseNames {
  return {
    item: verbRun.itemName,
    target: verbRun.targetName ?? undefined,
    from: describeFromName(state, verbRun),
  };
}

/**
 * A phrase about the run in each perspective: "hit Tobias with a knife" to onlookers, "hit me with
 * a knife" to Tobias; a verb aimed at oneself reads "themselves" to others and "myself" to the user.
 */
function describeAimedPhrases(
  state: WorldState,
  verbRun: VerbRun,
  describe: (names: PhraseNames) => string,
): AimedPhrases {
  const names = describeNames(state, verbRun);
  const description = describe(names);
  const { target } = verbRun;
  if (target?.kind !== "agent") return { description };
  if (target.agentId === verbRun.userId) {
    const own = config.verbs.selfTargetWords.own;
    return { description, actorDescription: describe({ ...names, target: own }) };
  }
  return {
    description,
    targetDescription: describe({ ...names, target: config.verbs.targetOwnWord }),
  };
}

function prefixPhrases(phrases: AimedPhrases, prefix: string): AimedPhrases {
  const prefixed: AimedPhrases = { description: `${prefix}${phrases.description}` };
  if (phrases.actorDescription !== undefined) {
    prefixed.actorDescription = `${prefix}${phrases.actorDescription}`;
  }
  if (phrases.targetDescription !== undefined) {
    prefixed.targetDescription = `${prefix}${phrases.targetDescription}`;
  }
  return prefixed;
}

/** The event's target: what the verb is aimed at, or else the thing used. */
function describeRunTarget(verbRun: VerbRun): { targetId: string | null; targetName: string } {
  const { target } = verbRun;
  if (target === null)
    return { targetId: verbRun.itemIds[0] ?? null, targetName: verbRun.itemName };
  const targetId = target.kind === "agent" ? target.agentId : target.entityId;
  return { targetId, targetName: verbRun.targetName ?? "" };
}

/**
 * How far the verb is heard: the loudness of the first `wait` the run reached (with `if` blocks,
 * not always the first in the list). Null before it reaches one, or when that sets none.
 */
export function computeLoudness(run: StepRun, verb: Verb): number | null {
  const index = run.verbRun?.firstWaitIndex ?? null;
  const firstWait = index === null ? undefined : verb.steps[index];
  if (firstWait?.step !== "wait" || firstWait.loudness === undefined) return null;
  return resolveNumber(scopeOf(run), firstWait.loudness);
}

/** What a death during this verb reads, with `{actor}` left to be filled when it is settled. */
export function describeKilledPhrase(state: WorldState, verbRun: VerbRun, verb: Verb): string {
  return describeVerbPhrase(verb, "killed", describeNames(state, verbRun));
}

/** "bake bread at the oven", for "I tried to ..." */
export function describeVerbAttempt(state: WorldState, verbRun: VerbRun, verb: Verb): string {
  return describeVerbPhrase(verb, "attempt", describeNames(state, verbRun));
}

/** "started baking bread at the oven", when the verb reaches its first `wait`. */
export function announceStarted(run: StepRun, verb: Verb): void {
  const { context, verbRun } = run;
  if (verbRun === null) return;
  const { state, result } = context;
  const phrases = prefixPhrases(
    describeAimedPhrases(state, verbRun, (names) =>
      describeOngoingVerb(state.items, verb.name, names),
    ),
    "started ",
  );
  const event = createUserEvent(state, verbRun.userId, {
    kind: "action_started",
    ...phrases,
    ...describeRunTarget(verbRun),
    loudness: computeLoudness(run, verb),
  });
  broadcastEvent(state, event, result);
}

function describeMade(state: WorldState, verbRun: VerbRun): string {
  if (Object.keys(verbRun.made).length === 0) return "";
  return `, making ${describeItemCounts(state.items, verbRun.made)}`;
}

/** "finished baking bread, making 4 bread" after a wait, otherwise the verb's `done` phrase. */
export function announceFinished(run: StepRun, verb: Verb): void {
  const { context, verbRun } = run;
  if (verbRun === null) return;
  const { state, result } = context;
  const phrases = verbRun.hasWaited
    ? addSlowFinish(
        prefixPhrases(
          describeAimedPhrases(
            state,
            verbRun,
            (names) =>
              `${describeOngoingVerb(state.items, verb.name, names)}${describeMade(state, verbRun)}`,
          ),
          "finished ",
        ),
        verbRun,
      )
    : describeAimedPhrases(state, verbRun, (names) => describeVerbPhrase(verb, "done", names));
  const event = createUserEvent(state, verbRun.userId, {
    kind: "action_finished",
    ...phrases,
    ...describeRunTarget(verbRun),
    loudness: run.isInPassing ? computeLoudness(run, verb) : null,
  });
  broadcastEvent(state, event, result);
}

/**
 * The `attacked` or `missed` event everyone in sight takes in, before the later steps land. A
 * sleeping target doesn't perceive it: they only wake up hurt.
 */
export function announceHitRoll(run: StepRun, verb: Verb, isHit: boolean): void {
  const { context, verbRun } = run;
  if (verbRun === null) return;
  const { state, result } = context;
  const phrases = describeAimedPhrases(state, verbRun, (names) =>
    describeVerbPhrase(verb, isHit ? "hit" : "missed", names),
  );
  const { target } = verbRun;
  const sleepingTargetIds =
    target?.kind === "agent" && isAsleep(findAgent(state, target.agentId)) ? [target.agentId] : [];
  const event = createUserEvent(state, verbRun.userId, {
    kind: isHit ? "attacked" : "missed",
    ...phrases,
    ...describeRunTarget(verbRun),
    loudness: computeLoudness(run, verb),
  });
  broadcastEvent(state, event, result, { unperceivedBy: sleepingTargetIds });
}
