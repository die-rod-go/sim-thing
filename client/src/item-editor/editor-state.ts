import type {
  ItemFile,
  ItemFileMessage,
  ItemFileSavedMessage,
  ItemProblem,
  ItemReference,
} from "@village/shared";

export const EDITOR_TABS = ["items", "components", "verbs", "rules", "world"] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export type SaveStatus = "idle" | "saving" | "saved" | "rejected";

export interface EditorState {
  isLoaded: boolean;
  loadError: string | null;
  references: ItemReference[];
  /** The item file as last read from or written to disk. */
  savedFile: ItemFile | null;
  draft: ItemFile | null;
  /** The file sent with the save still waiting for a reply. */
  pendingFile: ItemFile | null;
  saveStatus: SaveStatus;
  /** Problems the server reported on the last rejected save. */
  serverProblems: ItemProblem[];
  tab: EditorTab;
  /** The selected entry of each tab, by position. */
  selectedIndexes: Record<EditorTab, number>;
}

export interface TabSelection {
  tab: EditorTab;
  index: number;
}

export type EditorAction =
  | { kind: "loaded"; message: ItemFileMessage }
  | { kind: "save_started"; file: ItemFile }
  | { kind: "saved"; message: ItemFileSavedMessage }
  | { kind: "edited"; draft: ItemFile; selection?: TabSelection }
  | { kind: "selected"; selection: TabSelection }
  | { kind: "tab_changed"; tab: EditorTab };

export const initialEditorState: EditorState = {
  isLoaded: false,
  loadError: null,
  references: [],
  savedFile: null,
  draft: null,
  pendingFile: null,
  saveStatus: "idle",
  serverProblems: [],
  tab: "items",
  selectedIndexes: {
    items: 0,
    verbs: 0,
    components: 0,
    rules: 0,
    world: 0,
  },
};

export function countTabEntries(file: ItemFile | null, tab: EditorTab): number {
  if (file === null) return 0;
  if (tab === "items") return file.definitions.length;
  if (tab === "verbs") return file.verbs.length;
  if (tab === "rules") return file.rules.length;
  if (tab === "world") return 1;
  return Object.keys(file.components).length;
}

function clampSelections(
  indexes: Record<EditorTab, number>,
  file: ItemFile | null,
  selection?: TabSelection,
): Record<EditorTab, number> {
  const wanted = selection ? { ...indexes, [selection.tab]: selection.index } : indexes;
  const entries = EDITOR_TABS.map((tab) => {
    const lastIndex = countTabEntries(file, tab) - 1;
    return [tab, Math.max(0, Math.min(wanted[tab], lastIndex))] as const;
  });
  return Object.fromEntries(entries) as Record<EditorTab, number>;
}

export function reduceEditorState(state: EditorState, action: EditorAction): EditorState {
  switch (action.kind) {
    case "loaded": {
      const { message } = action;
      return {
        ...state,
        isLoaded: true,
        loadError: message.loadError,
        references: message.references,
        savedFile: message.itemFile,
        draft: message.itemFile === null ? null : structuredClone(message.itemFile),
        pendingFile: null,
        saveStatus: "idle",
        serverProblems: [],
        selectedIndexes: clampSelections(state.selectedIndexes, message.itemFile),
      };
    }
    case "save_started":
      return { ...state, pendingFile: action.file, saveStatus: "saving", serverProblems: [] };
    case "saved": {
      const { message } = action;
      if (!message.isSaved) {
        return {
          ...state,
          pendingFile: null,
          saveStatus: "rejected",
          serverProblems: message.problems,
        };
      }
      return {
        ...state,
        savedFile: state.pendingFile ?? state.savedFile,
        pendingFile: null,
        saveStatus: "saved",
        serverProblems: [],
      };
    }
    case "edited":
      return {
        ...state,
        draft: action.draft,
        selectedIndexes: clampSelections(state.selectedIndexes, action.draft, action.selection),
        tab: action.selection?.tab ?? state.tab,
        saveStatus: state.saveStatus === "saving" ? "saving" : "idle",
        serverProblems: state.saveStatus === "saving" ? state.serverProblems : [],
      };
    case "selected":
      return {
        ...state,
        tab: action.selection.tab,
        selectedIndexes: clampSelections(state.selectedIndexes, state.draft, action.selection),
      };
    case "tab_changed":
      return { ...state, tab: action.tab };
  }
}

export function hasUnsavedChanges(state: EditorState): boolean {
  if (state.draft === null || state.savedFile === null) return false;
  return JSON.stringify(state.draft) !== JSON.stringify(state.savedFile);
}
