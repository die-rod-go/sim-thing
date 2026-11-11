import type {
  SeedAgent,
  SeedFile,
  SeedFileMessage,
  SeedFileSavedMessage,
  SeedProblem,
  SeedRules,
} from "@village/shared";
import { withoutBlankNotes } from "./seed-edits";

export type SaveStatus = "idle" | "saving" | "saved" | "rejected";

export interface EditorState {
  isLoaded: boolean;
  loadError: string | null;
  rules: SeedRules | null;
  newAgentTemplate: SeedAgent | null;
  /** The seed file as last read from or written to disk. */
  savedFile: SeedFile | null;
  draft: SeedFile | null;
  /** The file sent with the save still waiting for a reply. */
  pendingFile: SeedFile | null;
  selectedIndex: number;
  saveStatus: SaveStatus;
  /** Problems the server reported on the last rejected save. */
  serverProblems: SeedProblem[];
  wasWorldReset: boolean;
}

export type EditorAction =
  | { kind: "loaded"; message: SeedFileMessage }
  | { kind: "save_started"; file: SeedFile }
  | { kind: "saved"; message: SeedFileSavedMessage }
  | { kind: "edited"; draft: SeedFile; selectedIndex?: number }
  | { kind: "selected"; selectedIndex: number };

export const initialEditorState: EditorState = {
  isLoaded: false,
  loadError: null,
  rules: null,
  newAgentTemplate: null,
  savedFile: null,
  draft: null,
  pendingFile: null,
  selectedIndex: 0,
  saveStatus: "idle",
  serverProblems: [],
  wasWorldReset: false,
};

function clampIndex(index: number, draft: SeedFile | null): number {
  const lastIndex = (draft?.agents.length ?? 0) - 1;
  return Math.max(0, Math.min(index, lastIndex));
}

export function reduceEditorState(state: EditorState, action: EditorAction): EditorState {
  switch (action.kind) {
    case "loaded": {
      const { message } = action;
      return {
        ...state,
        isLoaded: true,
        loadError: message.loadError,
        rules: message.rules,
        newAgentTemplate: message.newAgentTemplate,
        savedFile: message.seedFile,
        draft: message.seedFile === null ? null : structuredClone(message.seedFile),
        pendingFile: null,
        selectedIndex: clampIndex(state.selectedIndex, message.seedFile),
        saveStatus: "idle",
        serverProblems: [],
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
        wasWorldReset: message.isWorldReset,
      };
    }
    case "edited":
      return {
        ...state,
        draft: action.draft,
        selectedIndex: clampIndex(action.selectedIndex ?? state.selectedIndex, action.draft),
        saveStatus: state.saveStatus === "saving" ? "saving" : "idle",
      };
    case "selected":
      return { ...state, selectedIndex: clampIndex(action.selectedIndex, state.draft) };
  }
}

/** Compares the draft with the saved file, leaving out blank notes, which are never saved. */
export function hasUnsavedChanges(state: EditorState): boolean {
  if (state.draft === null || state.savedFile === null) return false;
  const draftText = JSON.stringify(withoutBlankNotes(state.draft));
  return draftText !== JSON.stringify(withoutBlankNotes(state.savedFile));
}
