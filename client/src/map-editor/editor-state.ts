import type {
  MapFileMessage,
  MapFileSavedMessage,
  MapProblem,
  MapReferences,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { listTileTypes, parseMapDocument, type MapDocument, type TileType } from "./map-document";
import { isSelectionOnMap, type MapSelection } from "./map-selection";

export type SaveStatus = "idle" | "saving" | "saved" | "rejected";

export interface MapEditorState {
  isLoaded: boolean;
  loadError: string | null;
  references: MapReferences;
  tileTypes: TileType[];
  /** The map as last read from or written to disk. */
  savedDocument: MapDocument | null;
  draft: MapDocument | null;
  /** The map sent with the save still waiting for a reply. */
  pendingDocument: MapDocument | null;
  /** Earlier drafts, newest last; one entry per edit or per whole drag. */
  undoStack: MapDocument[];
  redoStack: MapDocument[];
  selection: MapSelection | null;
  saveStatus: SaveStatus;
  /** Problems the server reported on the last save. */
  serverProblems: MapProblem[];
  wasWorldReset: boolean;
}

export type MapEditorAction =
  | { kind: "loaded"; message: MapFileMessage }
  | { kind: "save_started"; document: MapDocument }
  | { kind: "saved"; message: MapFileSavedMessage }
  /** `isContinuation` folds the edit into the previous undo step, as during a drag. */
  | {
      kind: "edited";
      document: MapDocument;
      isContinuation?: boolean;
      selection?: MapSelection | null;
    }
  | { kind: "selected"; selection: MapSelection | null }
  | { kind: "undone" }
  | { kind: "redone" };

export const initialMapEditorState: MapEditorState = {
  isLoaded: false,
  loadError: null,
  references: { placeableItems: [], characters: [] },
  tileTypes: [],
  savedDocument: null,
  draft: null,
  pendingDocument: null,
  undoStack: [],
  redoStack: [],
  selection: null,
  saveStatus: "idle",
  serverProblems: [],
  wasWorldReset: false,
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reduceLoaded(state: MapEditorState, message: MapFileMessage): MapEditorState {
  const base = { ...initialMapEditorState, isLoaded: true, references: message.references };
  if (message.mapFile === null) return { ...base, loadError: message.loadError };
  try {
    const document = parseMapDocument(message.mapFile);
    const tileTypes = listTileTypes(message.mapFile);
    return { ...base, tileTypes, savedDocument: document, draft: document };
  } catch (error) {
    return { ...state, ...base, loadError: describeError(error) };
  }
}

function keepSelectionOnMap(
  selection: MapSelection | null,
  document: MapDocument,
): MapSelection | null {
  return selection && isSelectionOnMap(document, selection) ? selection : null;
}

function pushUndo(undoStack: readonly MapDocument[], document: MapDocument): MapDocument[] {
  return [...undoStack, document].slice(-clientConfig.mapEditor.maxUndoSteps);
}

export function reduceMapEditorState(
  state: MapEditorState,
  action: MapEditorAction,
): MapEditorState {
  switch (action.kind) {
    case "loaded":
      return reduceLoaded(state, action.message);
    case "edited": {
      if (!state.draft || action.document === state.draft) return state;
      const undoStack = action.isContinuation
        ? state.undoStack
        : pushUndo(state.undoStack, state.draft);
      const selection = action.selection === undefined ? state.selection : action.selection;
      return {
        ...state,
        draft: action.document,
        undoStack,
        redoStack: [],
        selection: keepSelectionOnMap(selection, action.document),
        saveStatus: state.saveStatus === "saving" ? "saving" : "idle",
      };
    }
    case "selected":
      return { ...state, selection: action.selection };
    case "undone": {
      const previous = state.undoStack.at(-1);
      if (!previous || !state.draft) return state;
      return {
        ...state,
        draft: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.draft],
        selection: keepSelectionOnMap(state.selection, previous),
      };
    }
    case "redone": {
      const next = state.redoStack.at(-1);
      if (!next || !state.draft) return state;
      return {
        ...state,
        draft: next,
        undoStack: pushUndo(state.undoStack, state.draft),
        redoStack: state.redoStack.slice(0, -1),
        selection: keepSelectionOnMap(state.selection, next),
      };
    }
    case "save_started":
      return { ...state, pendingDocument: action.document, saveStatus: "saving" };
    case "saved": {
      const { message } = action;
      return {
        ...state,
        savedDocument: message.isSaved ? state.pendingDocument : state.savedDocument,
        pendingDocument: null,
        saveStatus: message.isSaved ? "saved" : "rejected",
        serverProblems: message.problems,
        wasWorldReset: message.isWorldReset,
      };
    }
  }
}

export function hasUnsavedChanges(state: MapEditorState): boolean {
  return state.draft !== state.savedDocument;
}
