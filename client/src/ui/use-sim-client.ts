import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@village/shared";
import { buildSocketUrl, SimConnection, type ConnectionStatus } from "../net/sim-connection";
import { applyServerMessage, selectInspectedAgent } from "../state/apply-server-message";
import { initialClientState, type ClientState } from "../state/client-state";

type ClientAction =
  { kind: "server"; message: ServerMessage } | { kind: "select"; agentId: string | null };

function reduceClientAction(state: ClientState, action: ClientAction): ClientState {
  return action.kind === "server"
    ? applyServerMessage(state, action.message)
    : selectInspectedAgent(state, action.agentId);
}

export interface SimClient {
  state: ClientState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDebugOverlayOn: boolean;
  setDebugOverlayOn: (isOn: boolean) => void;
  sendControl: (message: ClientMessage) => void;
  selectAgent: (agentId: string | null) => void;
}

/** Owns the WebSocket, the client state and the debug overlay toggle. */
export function useSimClient(): SimClient {
  const [state, dispatch] = useReducer(reduceClientAction, initialClientState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [isDebugOverlayOn, setIsDebugOverlayOn] = useState(false);
  const stateRef = useRef(state);
  const connectionRef = useRef<SimConnection | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sendControl = useCallback((message: ClientMessage) => {
    connectionRef.current?.send(message);
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    dispatch({ kind: "select", agentId });
    connectionRef.current?.send({ type: "inspect_agent", agentId });
  }, []);

  useEffect(() => {
    const connection = new SimConnection(buildSocketUrl(window.location), {
      onMessage: (message) => {
        dispatch({ kind: "server", message });
        const inspectedAgentId = stateRef.current.inspectedAgentId;
        const shouldReinspect =
          message.type === "snapshot" &&
          message.agents.some((agent) => agent.id === inspectedAgentId);
        if (shouldReinspect) connection.send({ type: "inspect_agent", agentId: inspectedAgentId });
      },
      onStatusChange: setConnectionStatus,
      onProtocolError: setProtocolError,
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, []);

  return {
    state,
    connectionStatus,
    protocolError,
    isDebugOverlayOn,
    setDebugOverlayOn: setIsDebugOverlayOn,
    sendControl,
    selectAgent,
  };
}
