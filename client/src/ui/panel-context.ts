import { createContext, useContext } from "react";
import type { ConversationThread } from "../format/conversations";
import type { ClientState } from "../state/client-state";

export interface PanelContextValue {
  state: ClientState;
  agentColors: Map<string, string>;
  /** Speech from the recent event window grouped into threads, newest first. */
  threads: ConversationThread[];
  selectAgent: (agentId: string | null) => void;
  /** Asks the village camera to frame these agents. */
  focusThread: (agentIds: readonly string[]) => void;
  /** Agents to highlight on the map while the pointer is over something about them. */
  highlightAgents: (agentIds: readonly string[]) => void;
  /** Starts playing this agent, handing any other back to the LLM; null stops playing. */
  playAs: (agentId: string | null) => void;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanelContext(): PanelContextValue {
  const value = useContext(PanelContext);
  if (value === null) throw new Error("usePanelContext must be used inside PanelContext");
  return value;
}
