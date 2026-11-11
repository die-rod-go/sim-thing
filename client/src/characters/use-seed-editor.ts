import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SeedFile } from "@village/shared";
import { buildSocketUrl, SimConnection, type ConnectionStatus } from "../net/sim-connection";
import {
  hasUnsavedChanges,
  initialEditorState,
  reduceEditorState,
  type EditorState,
} from "./editor-state";
import { withoutBlankNotes } from "./seed-edits";

export interface SeedEditorClient {
  state: EditorState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDirty: boolean;
  edit: (draft: SeedFile, selectedIndex?: number) => void;
  select: (selectedIndex: number) => void;
  save: (shouldResetWorld: boolean) => void;
  reload: () => void;
}

/** Owns the editor's WebSocket to the sim server and the draft seed file. */
export function useSeedEditor(): SeedEditorClient {
  const [state, dispatch] = useReducer(reduceEditorState, initialEditorState);
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
        if (message.type === "seed_file") dispatch({ kind: "loaded", message });
        if (message.type === "seed_file_saved") dispatch({ kind: "saved", message });
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        // A reconnect re-reads the file only when that can't throw away unsaved edits.
        if (status === "open" && !isDirtyRef.current) connection.send({ type: "load_seed_file" });
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

  const edit = useCallback((draft: SeedFile, selectedIndex?: number) => {
    dispatch({ kind: "edited", draft, selectedIndex });
  }, []);

  const select = useCallback((selectedIndex: number) => {
    dispatch({ kind: "selected", selectedIndex });
  }, []);

  const draft = state.draft;
  const save = useCallback(
    (shouldResetWorld: boolean) => {
      if (draft === null) return;
      const file = withoutBlankNotes(draft);
      const isSent = connectionRef.current?.send({
        type: "save_seed_file",
        seedFile: file,
        shouldResetWorld,
      });
      if (isSent) dispatch({ kind: "save_started", file });
    },
    [draft],
  );

  const reload = useCallback(() => {
    connectionRef.current?.send({ type: "load_seed_file" });
  }, []);

  return { state, connectionStatus, protocolError, isDirty, edit, select, save, reload };
}
