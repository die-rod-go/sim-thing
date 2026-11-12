import {
  matchesAppliesTo,
  matchesThing,
  type Entity,
  type Matcher,
  type Verb,
} from "@village/shared";
import { describeEntityName } from "../items/entity-store";
import { buildEntityView, normalizeVerbName } from "../items/verb-offers";
import { describeAttempt } from "./action-phrases";
import { listHereNearestFirst } from "./verb-candidates";
import type { WorldState } from "./world-state";

/** A verb a carried tool makes possible, on a thing at the agent's place. */
export interface ToolUse {
  verb: Verb;
  /** The verb's item: the thing it is done on, not the tool. */
  thing: Entity;
  /** "chop down the tree". */
  phrase: string;
}

/** The rules of the verb's `require` steps that look in what the user carries: its tools. */
function listToolRules(verb: Verb): Matcher[] {
  return verb.steps.flatMap((step) =>
    step.step === "require" && step.in === "user" ? [step.rule] : [],
  );
}

/** Whether the verb requires the user to carry something like the tool, if it were held. */
export function isToolFor(state: WorldState, agentId: string, verb: Verb, tool: Entity): boolean {
  const view = { ...buildEntityView(state, agentId, tool), where: "held" as const };
  return listToolRules(verb).some((rule) => matchesThing(rule, view));
}

/**
 * What the tool lets the agent do to things at its place: each verb that requires such a tool, on
 * each thing it applies to, nearest first, each phrase once. With `verbName`, only verbs so named.
 */
export function listToolUses(
  state: WorldState,
  agentId: string,
  tool: Entity,
  verbName?: string,
): ToolUse[] {
  const verbs = state.items.verbs.filter(
    (verb) =>
      (verbName === undefined || normalizeVerbName(verb.name) === normalizeVerbName(verbName)) &&
      isToolFor(state, agentId, verb, tool),
  );
  if (verbs.length === 0) return [];
  const things = listHereNearestFirst(state, agentId).filter((thing) => thing.id !== tool.id);
  const uses = verbs.flatMap((verb) =>
    things
      .filter((thing) => matchesAppliesTo(verb, buildEntityView(state, agentId, thing)))
      .map((thing) => ({
        verb,
        thing,
        phrase: describeAttempt(state.items, verb.name, {
          item: describeEntityName(state, thing),
        }),
      })),
  );
  const phrases = new Set<string>();
  return uses.filter((use) => {
    if (phrases.has(use.phrase)) return false;
    phrases.add(use.phrase);
    return true;
  });
}
