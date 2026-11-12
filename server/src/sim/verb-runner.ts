import type { Entity, Step, Verb } from "@village/shared";
import { config } from "../config";
import { describeEntityName, findEntityIfPresent } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { isDead } from "../status/health";
import { getAgentRuntime, type VerbChoice, type VerbRun } from "./agent-runtime";
import { failAction } from "./failure";
import { applyStep } from "./steps/step-registry";
import { refreshSnapshots } from "./steps/step-roles";
import type { StepRun } from "./steps/step-run";
import type { TickContext } from "./tick-context";
import { findResumeProblem, findStepsRefusal } from "./verb-run-checks";
import {
  announceFinished,
  announceHitRoll,
  announceStarted,
  describeKilledPhrase,
  describeVerbAttempt,
} from "./verb-run-events";
import { findVerbSlowdown, noteSlowStart, withSlowdown } from "./verb-slowdown";
import { findAgent, markAgentChanged, replaceAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** Everything resolution settled, ready to run. */
export interface VerbStart {
  /** Index into `state.items.verbs`. */
  verbIndex: number;
  /** The item and its stack, oldest first; empty for a bare-handed verb. */
  itemIds: string[];
  /** The item as phrases name it ("bread", "2 bread", "tavern chest"). */
  itemName: string;
  /** The holder of an item taken from inside something. */
  from: ThingRef | null;
  target: ThingRef | null;
  /** The target as phrases name it ("Tobias", "the chest", "themselves"). */
  targetName: string | null;
  choice: VerbChoice;
}

type Progress = { kind: "paused" | "finished" | "stopped" } | { kind: "refused"; reason: string };

function requireVerb(state: WorldState, verbIndex: number): Verb {
  const verb = state.items.verbs[verbIndex];
  if (verb === undefined) throw new Error(`There is no verb at index ${verbIndex}`);
  return verb;
}

function listItemHolders(state: WorldState, itemIds: readonly string[]) {
  const holders: Record<string, string | null> = {};
  for (const entityId of itemIds) {
    const entity = findEntityIfPresent(state, entityId);
    if (!entity) continue;
    holders[entityId] = entity.location.kind === "tile" ? null : entity.location.holderId;
  }
  return holders;
}

function cutChoice(choice: VerbChoice): VerbChoice {
  if (choice.text === undefined) return { ...choice };
  return { ...choice, text: choice.text.slice(0, config.verbs.maxTextChars) };
}

export function buildVerbRun(state: WorldState, agentId: string, start: VerbStart): VerbRun {
  const verbRun: VerbRun = {
    agentId,
    verbIndex: start.verbIndex,
    verbName: requireVerb(state, start.verbIndex).name,
    itemIds: [...start.itemIds],
    itemName: start.itemName,
    from: start.from,
    target: start.target,
    targetName: start.targetName,
    choice: cutChoice(start.choice),
    stepIndex: 0,
    isHit: null,
    snapshots: {},
    namedIds: {},
    itemHolderIds: listItemHolders(state, start.itemIds),
    touchedIds: [],
    made: {},
    hasWaited: false,
    startedAtTick: state.tick,
  };
  refreshSnapshots(state, verbRun);
  return verbRun;
}

function buildStepRun(
  context: TickContext,
  verbRun: VerbRun,
  verb: Verb,
  isInPassing: boolean,
): StepRun {
  return {
    context,
    verbRun,
    self: null,
    sourceAgentId: verbRun.agentId,
    killedPhrase: describeKilledPhrase(context.state, verbRun, verb),
    depth: 0,
    isInPassing,
  };
}

function endRun(context: TickContext, agentId: string): void {
  const { state, result } = context;
  getAgentRuntime(state, agentId).verbRun = null;
  replaceAgent(state, { ...findAgent(state, agentId), currentAction: null });
  markAgentChanged(result, agentId);
}

function failVerb(run: StepRun, verb: Verb, reason: string): void {
  const { verbRun } = run;
  if (verbRun === null) return;
  const { state, result } = run.context;
  failAction(state, result, verbRun.agentId, describeVerbAttempt(state, verbRun, verb), reason);
}

function beginRun(context: TickContext, verbRun: VerbRun): void {
  const { state, result } = context;
  const { agentId } = verbRun;
  replaceAgent(state, {
    ...findAgent(state, agentId),
    currentAction: {
      kind: "interact",
      target: verbRun.itemName,
      verb: verbRun.verbName,
      endsAtTick: state.tick,
    },
  });
  const runtime = getAgentRuntime(state, agentId);
  runtime.walk = null;
  runtime.verbRun = verbRun;
  markAgentChanged(result, agentId);
  const [itemId] = verbRun.itemIds;
  if (itemId !== undefined) {
    result.verbStarts.push({ agentId, entityId: itemId, verb: verbRun.verbName });
  }
}

function pauseRun(run: StepRun, verb: Verb, step: Step, untilTick: number | null): void {
  const { verbRun } = run;
  if (verbRun === null) return;
  if (run.isInPassing) throw new Error(`"${verb.name}" paused in passing at its ${step.step} step`);
  const { state, result } = run.context;
  const agent = findAgent(state, verbRun.agentId);
  if (agent.currentAction !== null) {
    const currentAction = { ...agent.currentAction, endsAtTick: untilTick };
    replaceAgent(state, { ...agent, currentAction });
    markAgentChanged(result, verbRun.agentId);
  }
  if (step.step === "wait" && !verbRun.hasWaited) {
    verbRun.hasWaited = true;
    announceStarted(run, verb);
  }
}

function addMade(verbRun: VerbRun, made: { definitionId: string; count: number } | undefined) {
  if (made === undefined || made.count === 0) return;
  verbRun.made[made.definitionId] = (verbRun.made[made.definitionId] ?? 0) + made.count;
}

/**
 * Runs the steps from `stepIndex` until the verb pauses at a `wait` or `sleep`, finishes, a step
 * refuses, or the user dies. What earlier steps did always stays.
 */
function executeSteps(run: StepRun, verb: Verb): Progress {
  const { verbRun } = run;
  if (verbRun === null) throw new Error(`"${verb.name}" ran without a VerbRun`);
  const { state } = run.context;
  while (verbRun.stepIndex < verb.steps.length) {
    const step = verb.steps[verbRun.stepIndex]!;
    const outcome = applyStep(run, step);
    if (outcome.kind === "refused") return { kind: "refused", reason: outcome.reason };
    verbRun.stepIndex += 1;
    refreshSnapshots(state, verbRun);
    if (outcome.kind === "done") addMade(verbRun, outcome.made);
    if (step.step === "roll_hit" && verbRun.isHit !== null) {
      announceHitRoll(run, verb, verbRun.isHit);
    }
    if (isDead(findAgent(state, verbRun.agentId))) return { kind: "stopped" };
    if (outcome.kind === "pause") {
      pauseRun(run, verb, step, outcome.untilTick);
      return { kind: "paused" };
    }
  }
  return { kind: "finished" };
}

/** The last step ran. A verb that rolled to hit has already announced itself. */
function finishVerb(run: StepRun, verb: Verb): void {
  const { verbRun } = run;
  if (verbRun === null) return;
  if (!run.isInPassing) endRun(run.context, verbRun.agentId);
  if (!verb.steps.some((step) => step.step === "roll_hit")) announceFinished(run, verb);
}

function settle(run: StepRun, verb: Verb, progress: Progress): void {
  if (progress.kind === "refused") failVerb(run, verb, progress.reason);
  else if (progress.kind === "finished") finishVerb(run, verb);
}

/**
 * Starts a verb where the agent stands. Every step is asked first whether it could run (a refusal
 * is filed as a failure and nothing has changed); then the steps run until the first `wait`.
 * Resolution has already checked that the item and target are in reach and sight.
 */
export function startVerbRun(context: TickContext, agentId: string, start: VerbStart): void {
  const { state, result } = context;
  const verb = requireVerb(state, start.verbIndex);
  const verbRun = buildVerbRun(state, agentId, start);
  const slowdown = findVerbSlowdown(state, findAgent(state, agentId), verb);
  const slowedRun = withSlowdown(verbRun, slowdown);
  const run = buildStepRun(context, slowedRun, verb, false);
  const refusal = findStepsRefusal(run, verb, 0);
  if (refusal !== null) {
    failAction(state, result, agentId, describeVerbAttempt(state, slowedRun, verb), refusal);
    return;
  }
  beginRun(context, slowedRun);
  settle(run, verb, executeSteps(run, verb));
  noteSlowStart(state, slowedRun);
}

/**
 * Continues the agent's verb after a `wait` ran out. The item must still be where it was and the
 * target still there, fitting, in sight and in reach; a target only out of reach at a `roll_hit`
 * is a miss. The steps still to run are checked again.
 */
export function resumeRunningVerb(context: TickContext, agentId: string): void {
  const { state } = context;
  const verbRun = getAgentRuntime(state, agentId).verbRun;
  const verb = verbRun ? state.items.verbs[verbRun.verbIndex] : undefined;
  if (!verbRun || verb?.name !== verbRun.verbName) {
    endRun(context, agentId);
    return;
  }
  const run = buildStepRun(context, verbRun, verb, false);
  const problem = findResumeProblem(run, verb);
  if (problem !== null) {
    if (!problem.isOnlyOutOfReach || verb.steps[verbRun.stepIndex]?.step !== "roll_hit") {
      failVerb(run, verb, problem.reason);
      return;
    }
    verbRun.isHit = false;
    announceHitRoll(run, verb, false);
    verbRun.stepIndex += 1;
  }
  const refusal = findStepsRefusal(run, verb, verbRun.stepIndex);
  if (refusal !== null) {
    failVerb(run, verb, refusal);
    return;
  }
  settle(run, verb, executeSteps(run, verb));
}

/** Stops a verb early. What its earlier steps did stays done and its later steps never run. */
export function cancelRunningVerb(context: TickContext, agentId: string): void {
  endRun(context, agentId);
}

/**
 * Does a verb on the way through (a walker clearing its way): every `wait` takes no time, nothing is
 * kept running, and it is announced once with its `done` phrase. Returns why it can't be done, or
 * null when it was.
 */
export function runVerbInPassing(
  context: TickContext,
  agentId: string,
  verbIndex: number,
  entity: Entity,
): string | null {
  const { state } = context;
  const verb = requireVerb(state, verbIndex);
  const verbRun = buildVerbRun(state, agentId, {
    verbIndex,
    itemIds: [entity.id],
    itemName: describeEntityName(state, entity),
    from: null,
    target: null,
    targetName: null,
    choice: { amount: 1 },
  });
  const run = buildStepRun(context, verbRun, verb, true);
  const refusal = findStepsRefusal(run, verb, 0);
  if (refusal !== null) return refusal;
  const progress = executeSteps(run, verb);
  if (progress.kind === "refused") return progress.reason;
  if (progress.kind === "finished") announceFinished(run, verb);
  return null;
}
