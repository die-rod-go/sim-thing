import type { ItemDefinition } from "./item-file";
import type { ValidationContext } from "./item-problems";
import { checkMatcher } from "./matcher-validation";
import { checkStepRead } from "./read-validation";
import { checkStepNames } from "./step-field-validation";
import { listReachReads, listStepReads } from "./step-reads";
import { VERB_ONLY_STEPS, findStepOn, type Step, type StepType } from "./step-schema";
import {
  buildStepScope,
  couldReachBody,
  resolveThing,
  type StepOwner,
  type StepScope,
} from "./step-scope";

/** Steps that work on a thing named by `on`. */
const ON_STEPS: ReadonlySet<StepType> = new Set<StepType>([
  "check",
  "change",
  "damage",
  "set",
  "add",
  "remove",
  "move",
  "transform",
  "destroy",
  "send",
  "sound",
  "announce",
  "change_need",
  "read",
]);

const PICKING_PLACES = ["user", "item", "target"];

function checkThingName(name: string, path: string, scope: StepScope) {
  const thing = resolveThing(scope, name);
  if (!thing.ok) scope.context.problems.error(path, thing.problem);
}

function checkNearby(step: Step, path: string, scope: StepScope) {
  const { problems } = scope.context;
  const radius = "radius" in step ? step.radius : undefined;
  const around = "around" in step ? step.around : undefined;
  if (radius === undefined) problems.error(path, "`on: nearby` needs a `radius`.");
  if (around !== undefined) checkThingName(around, `${path}.around`, scope);
  else if (scope.owner.kind === "verb")
    problems.error(path, "`on: nearby` in a verb needs `around`.");
}

function checkOn(step: Step, path: string, scope: StepScope) {
  if (!ON_STEPS.has(step.step)) return;
  const on = findStepOn(step);
  if (on === undefined) {
    if (scope.owner.kind === "verb")
      scope.context.problems.error(path, "A step in a verb needs `on`.");
  } else if (on === "nearby") {
    checkNearby(step, path, scope);
  } else {
    checkThingName(on, `${path}.on`, scope);
  }
}

function checkDestination(step: Step, path: string, scope: StepScope) {
  if (step.step !== "move" && step.step !== "create") return;
  for (const [slot, name] of [
    ["into", step.into],
    ["at", step.at],
  ] as const) {
    if (name !== undefined) checkThingName(name, `${path}.${slot}`, scope);
  }
  if ((step.into === undefined) === (step.at === undefined)) {
    scope.context.problems.error(
      path,
      `\`${step.step}\` needs exactly one of \`into\` and \`at\`.`,
    );
  }
}

function checkPick(step: Step, path: string, scope: StepScope) {
  if (step.step !== "require" && step.step !== "use_up") return;
  const { problems } = scope.context;
  if (!PICKING_PLACES.includes(step.in)) {
    problems.error(`${path}.in`, "`in` must be `user`, `item` or `target`.");
  } else {
    checkThingName(step.in, `${path}.in`, scope);
  }
  checkMatcher(step.rule, `${path}.rule`, scope.context);
  if (step.as === undefined) return;
  if (scope.givenNames.has(step.as)) problems.error(`${path}.as`, `"${step.as}" is already used.`);
  scope.givenNames.set(step.as, step.rule);
}

function checkRuleSettings(step: Step, path: string, scope: StepScope) {
  const { problems } = scope.context;
  if (VERB_ONLY_STEPS.has(step.step)) {
    problems.error(path, `\`${step.step}\` only works in verbs: a rule has no verb run.`);
  }
  if (step.evenOnMiss !== undefined) problems.error(path, "`evenOnMiss` only works in verbs.");
  if (step.step === "damage" && step.scaledByStrength !== undefined) {
    problems.error(path, "`scaledByStrength` only works in verbs.");
  }
}

function checkVerbSequence(
  step: Step,
  steps: readonly Step[],
  index: number,
  path: string,
  scope: StepScope,
) {
  const { problems } = scope.context;
  const earlier = steps.slice(0, index);
  if (step.evenOnMiss !== undefined && !earlier.some((other) => other.step === "roll_hit")) {
    problems.error(path, "`evenOnMiss` needs a `roll_hit` above it.");
  }
  if (step.step === "roll_hit") {
    if (earlier.some((other) => other.step === "roll_hit")) {
      problems.error(path, "A verb can have only one `roll_hit`.");
    }
    if (scope.owner.kind === "verb" && scope.owner.verb.target === undefined) {
      problems.error(path, "`roll_hit` needs a verb with a `target`.");
    }
  }
  if (
    step.step === "wait" &&
    step.loudness !== undefined &&
    earlier.some((other) => other.step === "wait")
  ) {
    problems.error(path, "`loudness` only works on a verb's first `wait`.");
  }
}

function checkStep(
  step: Step,
  steps: readonly Step[],
  index: number,
  ownerPath: string,
  scope: StepScope,
) {
  const path = `${ownerPath}.steps.${index}`;
  checkOn(step, path, scope);
  if (step.step === "check") checkMatcher(step.if, `${path}.if`, scope.context);
  checkDestination(step, path, scope);
  checkPick(step, path, scope);
  for (const read of listStepReads(step, `steps.${index}`)) {
    checkStepRead(read, ownerPath, scope);
  }
  checkStepNames(step, path, scope.context);
  if (scope.owner.kind === "rule") checkRuleSettings(step, path, scope);
  else checkVerbSequence(step, steps, index, path, scope);
}

/** Whether a `damage` step on the agent health field could hurt a body. */
export function isDamagingBodies(step: Step, scope: StepScope): boolean {
  if (step.step !== "damage") return false;
  if (step.field !== scope.context.file.world.agentHealth) return false;
  const on = step.on ?? (scope.owner.kind === "rule" ? "self" : undefined);
  return on !== undefined && couldReachBody(scope, on);
}

/**
 * Checks a verb's or rule's steps in order: whom they name, what they read, the names and field
 * types they use, and the order rules (one `roll_hit`, `evenOnMiss` after it). Returns the scope,
 * so the caller can ask which steps could hurt a body.
 */
export function checkSteps(
  owner: StepOwner,
  path: string,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: ValidationContext,
): StepScope {
  const steps = owner.kind === "verb" ? owner.verb.steps : owner.rule.steps;
  const scope = buildStepScope(owner, steps, context, definitionsById);
  if (owner.kind === "verb") {
    for (const read of listReachReads(owner.verb)) checkStepRead(read, path, scope);
  }
  steps.forEach((step, index) => checkStep(step, steps, index, path, scope));
  return scope;
}
