import { useState } from "react";
import { findAgent, type ClientState } from "../state/client-state";
import { EventFeed } from "./EventFeed";
import { InspectorTab } from "./InspectorTab";
import { MemoryTab } from "./MemoryTab";
import { PromptsTab } from "./PromptsTab";
import { EmptyNote } from "./widgets";

type TabName = "inspector" | "memory" | "prompts" | "events";

const TAB_LABELS: Record<TabName, string> = {
  inspector: "Inspector",
  memory: "Memory",
  prompts: "Prompts",
  events: "Events",
};

const TAB_NAMES = Object.keys(TAB_LABELS) as TabName[];

interface SidePanelProps {
  state: ClientState;
  onSelectAgent: (agentId: string | null) => void;
}

function SelectedAgentTab({ tab, state }: { tab: TabName; state: ClientState }) {
  const agent = findAgent(state, state.inspectedAgentId);
  if (!agent) return <EmptyNote>Click an agent on the map or in the list above.</EmptyNote>;
  const detail = state.agentDetail?.agentId === agent.id ? state.agentDetail : null;
  if (tab === "inspector") return <InspectorTab agent={agent} detail={detail} state={state} />;
  if (!detail) return <EmptyNote>Waiting for {agent.name}'s details from the server…</EmptyNote>;
  if (tab === "memory") return <MemoryTab detail={detail} state={state} />;
  return <PromptsTab detail={detail} state={state} />;
}

export function SidePanel({ state, onSelectAgent }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabName>("inspector");

  return (
    <aside className="side-panel">
      <div className="roster">
        {state.agents.map((agent) => (
          <button
            key={agent.id}
            className={agent.id === state.inspectedAgentId ? "chip is-active" : "chip"}
            onClick={() => onSelectAgent(agent.id === state.inspectedAgentId ? null : agent.id)}
          >
            {agent.name}
          </button>
        ))}
        {state.agents.length === 0 && <span className="muted">No agents yet</span>}
      </div>
      <nav className="tabs">
        {TAB_NAMES.map((tabName) => (
          <button
            key={tabName}
            className={tabName === activeTab ? "tab is-active" : "tab"}
            onClick={() => setActiveTab(tabName)}
          >
            {TAB_LABELS[tabName]}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {activeTab === "events" ? (
          <EventFeed state={state} />
        ) : (
          <SelectedAgentTab tab={activeTab} state={state} />
        )}
      </div>
    </aside>
  );
}
