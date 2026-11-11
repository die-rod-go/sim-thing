import type { Rule, RuleOfTrigger, RuleTrigger } from "./item-file";
import { listMentionedComponents } from "./matchers";

/** A rule with its place in the file's `rules`, so merged lists keep file order. */
export interface IndexedRule<Trigger extends RuleTrigger> {
  index: number;
  rule: RuleOfTrigger<Trigger>;
}

/** The file's rules sorted for the rule engine; every list is in file order. */
export interface RuleIndex {
  every: readonly IndexedRule<"every">[];
  stimulusByName: ReadonlyMap<string, readonly IndexedRule<"stimulus">[]>;
  /** A write to a component can only change whether the rules that mention it match. */
  becomesByComponent: ReadonlyMap<string, readonly IndexedRule<"becomes">[]>;
}

function appendTo<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

export function buildRuleIndex(rules: readonly Rule[]): RuleIndex {
  const every: IndexedRule<"every">[] = [];
  const stimulusByName = new Map<string, IndexedRule<"stimulus">[]>();
  const becomesByComponent = new Map<string, IndexedRule<"becomes">[]>();
  rules.forEach((rule, index) => {
    if (rule.trigger === "every") every.push({ index, rule });
    else if (rule.trigger === "stimulus") appendTo(stimulusByName, rule.stimulus, { index, rule });
    else {
      for (const component of listMentionedComponents(rule.if)) {
        appendTo(becomesByComponent, component, { index, rule });
      }
    }
  });
  return { every, stimulusByName, becomesByComponent };
}
