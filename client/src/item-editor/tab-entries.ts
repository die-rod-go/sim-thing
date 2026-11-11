import type { ItemFile, ItemProblem } from "@village/shared";
import { addComponentDeclaration, removeComponentDeclaration } from "./declaration-edits";
import { addDefinition, removeDefinition } from "./definition-edits";
import type { EditorTab } from "./editor-state";
import { selectEntryProblems, selectProblemsUnder } from "./problems";
import { addRule, describeRuleTrigger, removeRule, summarizeRule } from "./rules-edits";
import { addVerb, buildNewVerb, removeVerb } from "./verb-edits";
import { findWorstSeverity, type SideListEntry } from "./widgets";

export const TAB_LABELS: Record<EditorTab, string> = {
  items: "Items",
  verbs: "Verbs",
  components: "Components",
  rules: "Rules",
};

/** What the sidebar lists for a tab, each with its worst problem. */
export function listTabEntries(
  file: ItemFile,
  tab: EditorTab,
  problems: readonly ItemProblem[],
): SideListEntry[] {
  switch (tab) {
    case "items":
      return file.definitions.map((definition, index) => ({
        label: definition.name,
        severity: findWorstSeverity(selectEntryProblems(problems, file, "definitions", index)),
      }));
    case "verbs":
      return file.verbs.map((verb, index) => ({
        label: verb.name,
        severity: findWorstSeverity(selectEntryProblems(problems, file, "verbs", index)),
      }));
    case "rules":
      return file.rules.map((rule, index) => ({
        label: describeRuleTrigger(rule),
        detail: summarizeRule(rule),
        severity: findWorstSeverity(selectEntryProblems(problems, file, "rules", index)),
      }));
    case "components":
      return Object.keys(file.components).map((name) => ({
        label: name,
        severity: findWorstSeverity(selectProblemsUnder(problems, `components.${name}`)),
      }));
  }
}

export function addTabEntry(file: ItemFile, tab: EditorTab, stimuli: readonly string[]): ItemFile {
  switch (tab) {
    case "items":
      return addDefinition(file);
    case "verbs":
      return addVerb(file, buildNewVerb(file));
    case "rules":
      return addRule(file, stimuli);
    case "components":
      return addComponentDeclaration(file);
  }
}

export function removeTabEntry(file: ItemFile, tab: EditorTab, index: number): ItemFile {
  switch (tab) {
    case "items":
      return removeDefinition(file, index);
    case "verbs":
      return removeVerb(file, index);
    case "rules":
      return removeRule(file, index);
    case "components": {
      const name = Object.keys(file.components)[index];
      return name === undefined ? file : removeComponentDeclaration(file, name);
    }
  }
}
