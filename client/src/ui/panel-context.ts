import { createContext, useContext } from "react";
import type { ConversationThread } from "../format/conversations";
import type { ClientState } from "../state/client-state";

export interface PanelContextValue {
  state: ClientState;
  agentColors: Map<string, string>;
  /** Speech from the recent event window grouped into threads, newest first. */
  threads: ConversationThread[];
  selectAgent: (agentId: string | null) => void;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanelContext(): PanelContextValue {
  const value = useContext(PanelContext);
  if (value === null) throw new Error("usePanelContext must be used inside the side panel");
  return value;
}
