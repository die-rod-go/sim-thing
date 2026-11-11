import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ItemFile } from "@village/shared";
import { buildSocketUrl, SimConnection, type ConnectionStatus } from "../net/sim-connection";
import {
  hasUnsavedChanges,
  initialEditorState,
  reduceEditorState,
  type EditorState,
  type EditorTab,
  type TabSelection,
} from "./editor-state";

export interface ItemEditorClient {
  state: EditorState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDirty: boolean;
  edit: (draft: ItemFile, selection?: TabSelection) => void;
  select: (selection: TabSelection) => void;
  changeTab: (tab: EditorTab) => void;
  save: () => void;
  reload: () => void;
}

/** Owns the item editor's WebSocket to the sim server and the draft item file. */
export function useItemEditor(): ItemEditorClient {
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
        if (message.type === "item_file") dispatch({ kind: "loaded", message });
        if (message.type === "item_file_saved") dispatch({ kind: "saved", message });
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        // A reconnect re-reads the file only when that can't throw away unsaved edits.
        if (status === "open" && !isDirtyRef.current) connection.send({ type: "load_item_file" });
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

  const edit = useCallback((draft: ItemFile, selection?: TabSelection) => {
    dispatch({ kind: "edited", draft, selection });
  }, []);
  const select = useCallback((selection: TabSelection) => {
    dispatch({ kind: "selected", selection });
  }, []);
  const changeTab = useCallback((tab: EditorTab) => dispatch({ kind: "tab_changed", tab }), []);

  const draft = state.draft;
  const save = useCallback(() => {
    if (draft === null) return;
    const isSent = connectionRef.current?.send({ type: "save_item_file", itemFile: draft });
    if (isSent) dispatch({ kind: "save_started", file: draft });
  }, [draft]);

  const reload = useCallback(() => {
    connectionRef.current?.send({ type: "load_item_file" });
  }, []);

  return {
    state,
    connectionStatus,
    protocolError,
    isDirty,
    edit,
    select,
    changeTab,
    save,
    reload,
  };
}
