import type { ItemFile, ItemProblem } from "@village/shared";
import { addCondition, addReaction, removeCondition, removeReaction } from "./condition-edits";
import {
  addComponentDeclaration,
  addPropertyDeclaration,
  removeComponentDeclaration,
  removePropertyDeclaration,
} from "./declaration-edits";
import { addDefinition, removeDefinition } from "./definition-edits";
import type { EditorTab } from "./editor-state";
import { selectEntryProblems, selectProblemsUnder } from "./problems";
import { addVerb, buildNewVerb, removeVerb } from "./verb-edits";
import { findWorstSeverity, type SideListEntry } from "./widgets";

export const TAB_LABELS: Record<EditorTab, string> = {
  items: "Items",
  verbs: "Verbs",
  components: "Components",
  conditions: "Conditions",
  reactions: "Reactions",
  properties: "Properties",
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
        detail: definition.form,
        severity: findWorstSeverity(selectEntryProblems(problems, file, "definitions", index)),
      }));
    case "verbs":
      return file.verbs.map((verb, index) => ({
        label: verb.name,
        severity: findWorstSeverity(selectEntryProblems(problems, file, "verbs", index)),
      }));
    case "conditions":
      return file.conditions.map((condition, index) => ({
        label: condition.name,
        detail: condition.words,
        severity: findWorstSeverity(selectEntryProblems(problems, file, "conditions", index)),
      }));
    case "reactions":
      return file.reactions.map((reaction, index) => ({
        label: reaction.stimulus,
        detail: [reaction.property, reaction.condition].filter(Boolean).join(" + "),
        severity: findWorstSeverity(selectEntryProblems(problems, file, "reactions", index)),
      }));
    case "components":
      return Object.keys(file.components).map((name) => ({
        label: name,
        severity: findWorstSeverity(selectProblemsUnder(problems, `components.${name}`)),
      }));
    case "properties":
      return Object.keys(file.properties).map((name) => ({ label: name, severity: null }));
  }
}

export function addTabEntry(file: ItemFile, tab: EditorTab, stimuli: readonly string[]): ItemFile {
  switch (tab) {
    case "items":
      return addDefinition(file);
    case "verbs":
      return addVerb(file, buildNewVerb(file));
    case "conditions":
      return addCondition(file);
    case "reactions":
      return addReaction(file, stimuli);
    case "components":
      return addComponentDeclaration(file);
    case "properties":
      return addPropertyDeclaration(file);
  }
}

export function removeTabEntry(file: ItemFile, tab: EditorTab, index: number): ItemFile {
  switch (tab) {
    case "items":
      return removeDefinition(file, index);
    case "verbs":
      return removeVerb(file, index);
    case "conditions":
      return removeCondition(file, index);
    case "reactions":
      return removeReaction(file, index);
    case "components": {
      const name = Object.keys(file.components)[index];
      return name === undefined ? file : removeComponentDeclaration(file, name);
    }
    case "properties": {
      const name = Object.keys(file.properties)[index];
      return name === undefined ? file : removePropertyDeclaration(file, name);
    }
  }
}
