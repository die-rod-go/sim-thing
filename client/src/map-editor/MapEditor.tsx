import { useMemo } from "react";
import { findMapProblems, hasMapErrors, type MapProblem } from "@village/shared";
import type { ConnectionStatus } from "../net/sim-connection";
import { useGlyphPainter } from "../village/use-glyph-painter";
import type { MapEditorState } from "./editor-state";
import { MapProblemList } from "./InspectorPanel";
import { buildMapLayout } from "./map-edits";
import { MapWorkspace } from "./MapWorkspace";
import { useMapEditor } from "./use-map-editor";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected, retrying…",
};

function describeSaveStatus(
  state: MapEditorState,
  isDirty: boolean,
  problems: readonly MapProblem[],
): string {
  if (state.saveStatus === "saving") return "Saving…";
  if (hasMapErrors(problems)) return "Fix the errors to save";
  if (isDirty) return "Unsaved changes";
  if (state.saveStatus === "saved") {
    return state.wasWorldReset ? "Saved, and the village restarted" : "Saved to maps/village.json";
  }
  return "No changes";
}

export function MapEditor() {
  const editor = useMapEditor();
  const { state, isDirty } = editor;
  const glyphPainterStatus = useGlyphPainter();
  const { draft, references } = state;
  const problems = useMemo(
    () => (draft ? findMapProblems(buildMapLayout(draft), references) : []),
    [draft, references],
  );
  const isLive = editor.connectionStatus === "open";
  const canSave =
    isLive && draft !== null && !hasMapErrors(problems) && state.saveStatus !== "saving";

  const confirmSaveAndRestart = () => {
    const isConfirmed = window.confirm(
      "Save the map and restart the village? This wipes the running sim and reseeds every agent on the new map.",
    );
    if (isConfirmed) editor.save(true);
  };
  const confirmReload = () => {
    if (!isDirty || window.confirm("Throw away your unsaved changes?")) editor.reload();
  };

  return (
    <div className="editor-app">
      <header className="top-bar">
        <span className={`connection connection-${editor.connectionStatus}`}>
          {CONNECTION_LABELS[editor.connectionStatus]}
        </span>
        <h1 className="editor-title">Map</h1>
        <span className={`save-status save-${state.saveStatus}`}>
          {describeSaveStatus(state, isDirty, problems)}
        </span>
        <div className="button-group">
          <button disabled={state.undoStack.length === 0} onClick={editor.undo} title="Ctrl+Z">
            Undo
          </button>
          <button disabled={state.redoStack.length === 0} onClick={editor.redo} title="Ctrl+Y">
            Redo
          </button>
        </div>
        <div className="button-group editor-actions">
          <button disabled={!isLive || !isDirty} onClick={confirmReload}>
            Discard changes
          </button>
          <button disabled={!canSave || !isDirty} onClick={() => editor.save(false)}>
            Save
          </button>
          <button className="primary" disabled={!canSave} onClick={confirmSaveAndRestart}>
            Save and restart village
          </button>
          <a className="link-button" href="/">
            Back to the village
          </a>
        </div>
      </header>
      {state.loadError && (
        <div className="banner banner-error">Could not read the map: {state.loadError}</div>
      )}
      {state.saveStatus === "rejected" && state.serverProblems.length > 0 && (
        <div className="banner banner-error">
          The server refused to save:
          <MapProblemList problems={state.serverProblems} />
        </div>
      )}
      {glyphPainterStatus.kind === "error" && (
        <div className="banner banner-error">{glyphPainterStatus.message}</div>
      )}
      {editor.protocolError && <div className="banner banner-error">{editor.protocolError}</div>}
      {!draft || glyphPainterStatus.kind !== "ready" ? (
        <p className="editor-empty muted">
          {state.isLoaded ? "Nothing to edit." : "Loading the map from the sim server…"}
        </p>
      ) : (
        <MapWorkspace
          editor={editor}
          document={draft}
          glyphPainter={glyphPainterStatus.glyphPainter}
          problems={problems}
        />
      )}
    </div>
  );
}
