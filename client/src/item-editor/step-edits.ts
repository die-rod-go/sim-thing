import { listMentionedComponents, stepSchema, type ItemFile, type Step } from "@village/shared";
import { clientConfig } from "../client-config";

export type ParsedStepsText = { steps: Step[]; error: null } | { steps: null; error: string };

const stepListSchema = stepSchema.array();

export function formatStepsText(steps: readonly Step[]): string {
  return JSON.stringify(steps, null, clientConfig.itemEditor.jsonIndent);
}

/** Text as a list of steps, or the reason it isn't one (a JSON syntax error or the schema's complaints). */
export function parseStepsText(text: string): ParsedStepsText {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { steps: null, error: error instanceof Error ? error.message : String(error) };
  }
  const parsed = stepListSchema.safeParse(json);
  if (parsed.success) return { steps: parsed.data, error: null };
  return {
    steps: null,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "steps"}: ${issue.message}`)
      .join("; "),
  };
}

export function listAllSteps(file: ItemFile): Step[] {
  return [...file.verbs.flatMap((verb) => verb.steps), ...file.rules.flatMap((rule) => rule.steps)];
}

function findComponentOfPath(path: string): string {
  return path.split(".")[0] ?? path;
}

/** Components a step names: added or removed, in a field path, or in a matcher it carries. */
export function listStepComponents(step: Step): string[] {
  const components: string[] = [];
  if ("component" in step) components.push(step.component);
  if ("field" in step) components.push(findComponentOfPath(step.field));
  if ("author" in step && step.author !== undefined) {
    components.push(findComponentOfPath(step.author));
  }
  if ("rule" in step) components.push(...listMentionedComponents(step.rule));
  if ("if" in step) components.push(...listMentionedComponents(step.if));
  if (step.step === "create" && step.fields !== undefined) {
    components.push(...Object.keys(step.fields).map(findComponentOfPath));
  }
  return components;
}

/** Stimuli named literally by `send` steps. */
export function listStepStimuli(step: Step): string[] {
  return step.step === "send" && typeof step.stimulus === "string" ? [step.stimulus] : [];
}
