import { stepSchema, type Entity, type Step } from "@village/shared";
import { createEntity, describeEntityName, locateInside } from "../../items/entity-store";
import type { ThingRef } from "../../items/things";
import type { VerbChoice, VerbRun } from "../agent-runtime";
import { contextOf } from "../combat-test-kit";
import { setUpRules } from "../rule-test-kit";
import { sendStimulus } from "../rule-engine";
import type { TestSim } from "../test-sim";
import type { TickContext } from "../tick-context";
import { advanceStepIndex } from "./step-flow";
import { applyStep, findStepListRefusal, runStepList } from "./step-registry";
import { refreshSnapshots } from "./step-roles";
import type { StepRun } from "./step-run";

/*
 * Test helpers that run steps the way the verb runner will: a VerbRun for the user, an item stack
 * and a target, then each step checked and applied in order. Pauses are passed through.
 */

export interface VerbRunOptions {
  agentId?: string;
  verbName?: string;
  /** The stack the verb was chosen for, oldest first. */
  items?: readonly Entity[];
  target?: ThingRef;
  targetName?: string;
  from?: ThingRef;
  choice?: Partial<VerbChoice>;
  killedPhrase?: string;
  isInPassing?: boolean;
}

export function buildVerbRun(sim: TestSim, options: VerbRunOptions = {}): VerbRun {
  const { state } = sim;
  const items = options.items ?? [];
  const [first] = items;
  const verbRun: VerbRun = {
    userId: options.agentId ?? "mara",
    verbIndex: 0,
    verbName: options.verbName ?? "test verb",
    itemIds: items.map((entity) => entity.id),
    itemName: first ? describeEntityName(state, first) : "",
    from: options.from ?? null,
    target: options.target ?? null,
    targetName: options.targetName ?? null,
    choice: { amount: 1, ...options.choice },
    stepIndex: 0,
    isHit: null,
    snapshots: {},
    namedIds: {},
    itemHolderIds: {},
    touchedIds: [],
    made: {},
    hasWaited: false,
    firstWaitIndex: null,
    startedAtTick: state.tick,
  };
  refreshSnapshots(state, verbRun);
  return verbRun;
}

export function buildStepRun(
  context: TickContext,
  verbRun: VerbRun | null,
  overrides: Partial<StepRun> = {},
): StepRun {
  return {
    context,
    verbRun,
    self: null,
    sourceId: verbRun?.userId ?? null,
    killedPhrase: "",
    depth: 0,
    isInPassing: false,
    ...overrides,
  };
}

export interface StepsResult {
  context: TickContext;
  run: StepRun;
  /** The reason the verb failed, from the check before it ran or from a step as it ran. */
  failure: string | null;
  made: { definitionId: string; count: number } | null;
  pauseCount: number;
}

export function parseSteps(steps: readonly unknown[]): Step[] {
  return steps.map((step) => stepSchema.parse(step));
}

/** Checks every step, then runs them in order, as the runner does. */
export function runSteps(
  sim: TestSim,
  steps: readonly unknown[],
  options: VerbRunOptions = {},
): StepsResult {
  const context = contextOf(sim);
  const verbRun = buildVerbRun(sim, options);
  const run = buildStepRun(context, verbRun, {
    killedPhrase: options.killedPhrase ?? "",
    isInPassing: options.isInPassing ?? false,
  });
  const parsed = parseSteps(steps);
  const result: StepsResult = { context, run, failure: null, made: null, pauseCount: 0 };
  result.failure = findStepListRefusal(run, parsed);
  if (result.failure !== null) return result;
  let index = 0;
  while (index < parsed.length) {
    const outcome = applyStep(run, parsed[index]!);
    if (outcome.kind === "refused") {
      result.failure = outcome.reason;
      return result;
    }
    if (outcome.kind === "pause") result.pauseCount += 1;
    if (outcome.kind === "done" && outcome.made) result.made = outcome.made;
    index = advanceStepIndex(run, parsed, index, true);
    refreshSnapshots(sim.state, verbRun);
  }
  return result;
}

/** Runs a shipped verb's steps by name. */
export function runVerb(sim: TestSim, verbName: string, options: VerbRunOptions = {}): StepsResult {
  const verb = sim.state.items.file.verbs.find((candidate) => candidate.name === verbName);
  if (!verb) throw new Error(`No verb "${verbName}"`);
  return runSteps(sim, verb.steps, { ...options, verbName });
}

/** Applies steps as a rule fired on `self` would. */
export function runRuleSteps(
  sim: TestSim,
  self: ThingRef,
  steps: readonly unknown[],
  sourceId: string | null = null,
): TickContext {
  const context = contextOf(sim);
  const run = buildStepRun(context, null, { self, sourceId });
  runStepList(run, parseSteps(steps));
  return context;
}

/** Sends a stimulus as one of Mara's verbs would, returning the context it ran in. */
export function stimulate(
  sim: TestSim,
  receiver: ThingRef,
  stimulus: string,
  sourceId: string | null = "mara",
): TickContext {
  const context = contextOf(sim);
  sendStimulus(buildStepRun(context, null, { sourceId }), receiver, stimulus);
  return context;
}

export function giveEntity(sim: TestSim, agentId: string, definitionId: string): Entity {
  return createEntity(sim.state, definitionId, locateInside(agentId));
}

/** Removes everything the agent carries, so a test starts from empty hands. */
export function emptyHands(sim: TestSim, agentId: string): void {
  sim.state.entities = sim.state.entities.filter(
    (entity) => !(entity.location.kind === "inside" && entity.location.holderId === agentId),
  );
}

/** Mara and Tobias on the square with nothing in their hands; every roll comes out as `roll`. */
export function setUpSteps(roll = 0.99): TestSim {
  const sim = setUpRules(roll);
  emptyHands(sim, "mara");
  emptyHands(sim, "tobias");
  return sim;
}
