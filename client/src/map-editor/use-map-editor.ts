import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { buildSocketUrl, SimConnection, type ConnectionStatus } from "../net/sim-connection";
import {
  hasUnsavedChanges,
  initialMapEditorState,
  reduceMapEditorState,
  type MapEditorState,
} from "./editor-state";
import { serializeMapDocument, type MapDocument } from "./map-document";
import type { MapSelection } from "./map-selection";

export interface MapEditorClient {
  state: MapEditorState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDirty: boolean;
  edit: (
    document: MapDocument,
    options?: { isContinuation?: boolean; selection?: MapSelection | null },
  ) => void;
  select: (selection: MapSelection | null) => void;
  undo: () => void;
  redo: () => void;
  save: (shouldResetWorld: boolean) => void;
  reload: () => void;
}

/** Owns the map editor's WebSocket to the sim server, the draft map and its undo history. */
export function useMapEditor(): MapEditorClient {
  const [state, dispatch] = useReducer(reduceMapEditorState, initialMapEditorState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const connectionRef = useRef<SimConnection | null>(null);
  const isDirty = hasUnsavedChanges(state);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const connection = new SimConnection(buildSocketUrl(window.location), {
      onMessage: (message) => {
        if (message.type === "map_file") dispatch({ kind: "loaded", message });
        if (message.type === "map_file_saved") dispatch({ kind: "saved", message });
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        // A reconnect re-reads the file only when that can't throw away unsaved edits.
        if (status === "open" && !isDirtyRef.current) connection.send({ type: "load_map_file" });
      },
      onProtocolError: setProtocolError,
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  const edit = useCallback<MapEditorClient["edit"]>((document, options = {}) => {
    dispatch({ kind: "edited", document, ...options });
  }, []);
  const select = useCallback((selection: MapSelection | null) => {
    dispatch({ kind: "selected", selection });
  }, []);
  const undo = useCallback(() => dispatch({ kind: "undone" }), []);
  const redo = useCallback(() => dispatch({ kind: "redone" }), []);

  const draft = state.draft;
  const save = useCallback(
    (shouldResetWorld: boolean) => {
      if (draft === null) return;
      const isSent = connectionRef.current?.send({
        type: "save_map_file",
        mapFile: serializeMapDocument(draft),
        shouldResetWorld,
      });
      if (isSent) dispatch({ kind: "save_started", document: draft });
    },
    [draft],
  );

  const reload = useCallback(() => {
    connectionRef.current?.send({ type: "load_map_file" });
  }, []);

  return {
    state,
    connectionStatus,
    protocolError,
    isDirty,
    edit,
    select,
    undo,
    redo,
    save,
    reload,
  };
}
