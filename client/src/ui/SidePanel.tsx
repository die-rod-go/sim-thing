import { useMemo, useState } from "react";
import { clientConfig } from "../client-config";
import { buildAgentColors } from "../format/agent-colors";
import { groupConversations } from "../format/conversations";
import type { ClientState } from "../state/client-state";
import { CharacterSheet } from "./CharacterSheet";
import { ConversationsTab } from "./ConversationsTab";
import { EventFeed } from "./EventFeed";
import { PanelContext, type PanelContextValue } from "./panel-context";
import { Roster } from "./Roster";
import { TabBar } from "./widgets";

type PanelTabName = "character" | "conversations" | "events";

const PANEL_TABS: readonly { name: PanelTabName; label: string }[] = [
  { name: "character", label: "Character" },
  { name: "conversations", label: "Conversations" },
  { name: "events", label: "Events" },
];

interface SidePanelProps {
  state: ClientState;
  onSelectAgent: (agentId: string | null) => void;
}

export function SidePanel({ state, onSelectAgent }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTabName>("character");
  const agentColors = useMemo(() => buildAgentColors(state.agents), [state.agents]);
  const threads = useMemo(
    () => groupConversations(state.events, clientConfig.conversations.maxGapTicks),
    [state.events],
  );
  const contextValue = useMemo<PanelContextValue>(
    () => ({
      state,
      agentColors,
      threads,
      selectAgent: (agentId) => {
        onSelectAgent(agentId);
        if (agentId !== null) setActiveTab("character");
      },
    }),
    [state, agentColors, threads, onSelectAgent],
  );

  return (
    <PanelContext.Provider value={contextValue}>
      <aside className="side-panel">
        <Roster />
        <TabBar className="tabs" tabs={PANEL_TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="tab-body">
          {activeTab === "character" && <CharacterSheet />}
          {activeTab === "conversations" && <ConversationsTab />}
          {activeTab === "events" && <EventFeed />}
        </div>
      </aside>
    </PanelContext.Provider>
  );
}
