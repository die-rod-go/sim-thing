import { describe, expect, it } from "vitest";
import type { ItemFileMessage } from "@village/shared";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import { removeDefinition } from "../../src/item-editor/definition-edits";
import {
  countTabEntries,
  EDITOR_TABS,
  hasUnsavedChanges,
  initialEditorState,
  reduceEditorState,
} from "../../src/item-editor/editor-state";

function buildLoadedMessage(): ItemFileMessage {
  return {
    type: "item_file",
    itemFile: buildTestItemFile(),
    loadError: null,
    references: [],
  };
}

function loadState() {
  return reduceEditorState(initialEditorState, { kind: "loaded", message: buildLoadedMessage() });
}

describe("item editor state", () => {
  it("starts clean after loading the file", () => {
    const state = loadState();
    expect(state.isLoaded).toBe(true);
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("is dirty after an edit and clean again once the save is accepted", () => {
    const loaded = loadState();
    const draft = removeDefinition(loaded.draft ?? buildTestItemFile(), 0);
    const edited = reduceEditorState(loaded, { kind: "edited", draft });
    expect(hasUnsavedChanges(edited)).toBe(true);
    const saving = reduceEditorState(edited, { kind: "save_started", file: draft });
    const saved = reduceEditorState(saving, {
      kind: "saved",
      message: { type: "item_file_saved", isSaved: true, problems: [] },
    });
    expect(saved.saveStatus).toBe("saved");
    expect(hasUnsavedChanges(saved)).toBe(false);
  });

  it("keeps the draft and the server's problems when a save is refused", () => {
    const loaded = loadState();
    const draft = removeDefinition(loaded.draft ?? buildTestItemFile(), 0);
    const edited = reduceEditorState(loaded, { kind: "edited", draft });
    const problem = { severity: "error" as const, path: "file", message: "no" };
    const refused = reduceEditorState(edited, {
      kind: "saved",
      message: { type: "item_file_saved", isSaved: false, problems: [problem] },
    });
    expect(refused.saveStatus).toBe("rejected");
    expect(refused.serverProblems).toEqual([problem]);
    expect(hasUnsavedChanges(refused)).toBe(true);
  });

  it("clears the server's refusal once the draft is edited again", () => {
    const loaded = loadState();
    const problem = { severity: "error" as const, path: "file", message: "no" };
    const refused = reduceEditorState(loaded, {
      kind: "saved",
      message: { type: "item_file_saved", isSaved: false, problems: [problem] },
    });
    const draft = removeDefinition(refused.draft ?? buildTestItemFile(), 0);
    const edited = reduceEditorState(refused, { kind: "edited", draft });
    expect(edited.serverProblems).toEqual([]);
    expect(edited.saveStatus).toBe("idle");
  });

  it("lists the tabs in order and counts the world as one entry", () => {
    expect(EDITOR_TABS).toEqual(["items", "components", "verbs", "rules", "world"]);
    expect(countTabEntries(buildTestItemFile(), "world")).toBe(1);
    expect(countTabEntries(null, "world")).toBe(0);
  });

  it("keeps each tab's selection inside its list", () => {
    const loaded = loadState();
    const selected = reduceEditorState(loaded, {
      kind: "selected",
      selection: { tab: "items", index: 5 },
    });
    expect(selected.selectedIndexes.items).toBe(5);
    const draft = removeDefinition(selected.draft ?? buildTestItemFile(), 5);
    const edited = reduceEditorState(selected, { kind: "edited", draft });
    expect(edited.selectedIndexes.items).toBe(4);
    const verbs = reduceEditorState(edited, {
      kind: "selected",
      selection: { tab: "verbs", index: 9 },
    });
    expect(verbs.tab).toBe("verbs");
    expect(verbs.selectedIndexes.verbs).toBe(1);
  });
});
