import type { StepOfType, StepType } from "@village/shared";
import type { ThingRef } from "../../items/things";
import type { VerbRun } from "../agent-runtime";
import type { TickContext } from "../tick-context";

/** One list of steps being run: a verb's, or a rule's. */
export interface StepRun {
  context: TickContext;
  /** Null in a rule. */
  verbRun: VerbRun | null;
  /** The thing a rule fired on; null in a verb. */
  self: ThingRef | null;
  sourceAgentId: string | null;
  /** How a death from this run reads, before `{actor}` is filled. */
  killedPhrase: string;
  /** 0 for a verb or an `every` rule; one more for each rule fired from inside a run. */
  depth: number;
  /** A verb done in passing (a walker clearing its way): every `wait` takes no time. */
  isInPassing: boolean;
}

export type StepOutcome =
  | { kind: "done"; made?: { definitionId: string; count: number } }
  /** Null: until the agent wakes. */
  | { kind: "pause"; untilTick: number | null }
  /** The step found, as it ran, that it can't (the board filled up during the wait). */
  | { kind: "refused"; reason: string };

export interface StepHandler<Type extends StepType> {
  isVerbOnly: boolean;
  /** Why it can't run now, or null. Must not change anything. */
  findRefusal?(run: StepRun, step: StepOfType<Type>): string | null;
  run(run: StepRun, step: StepOfType<Type>): StepOutcome;
}

export type StepRegistry = { [Type in StepType]: StepHandler<Type> };

export const DONE: StepOutcome = { kind: "done" };
