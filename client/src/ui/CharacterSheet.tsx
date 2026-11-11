import { useState } from "react";
import type { Agent, AgentDetailMessage } from "@village/shared";
import { describeActivity } from "../format/character-sheet";
import { findAgent } from "../state/client-state";
import { MemoryTab } from "./MemoryTab";
import { OverviewTab } from "./OverviewTab";
import { usePanelContext } from "./panel-context";
import { PersonalityTab } from "./PersonalityTab";
import { PromptsTab } from "./PromptsTab";
import { RelationsTab } from "./RelationsTab";
import { ThoughtsTab } from "./ThoughtsTab";
import { ColorDot, EmptyNote, TabBar } from "./widgets";

type SheetTabName = "overview" | "thoughts" | "personality" | "relations" | "memory" | "prompts";

const SHEET_TABS: readonly { name: SheetTabName; label: string }[] = [
  { name: "overview", label: "Overview" },
  { name: "thoughts", label: "Thoughts" },
  { name: "personality", label: "Personality" },
  { name: "relations", label: "Relations" },
  { name: "memory", label: "Memory" },
  { name: "prompts", label: "Prompts" },
];

const TABS_NEEDING_DETAIL: ReadonlySet<SheetTabName> = new Set([
  "thoughts",
  "relations",
  "memory",
  "prompts",
]);

function SheetHeader({ agent }: { agent: Agent }) {
  const { state } = usePanelContext();
  return (
    <header className="sheet-header">
      <div className="sheet-title">
        <ColorDot agentId={agent.id} />
        <h2>{agent.name}</h2>
        <span className="sheet-profession">{agent.profession}</span>
      </div>
      <p className="sheet-status">
        Is {describeActivity(agent.currentAction, state.timeSettings)} at{" "}
        <strong>{agent.place}</strong>, feeling <em className="mood">{agent.mood}</em>.
      </p>
      {agent.intention && <p className="sheet-intention">{agent.intention}</p>}
    </header>
  );
}

function SheetBody({
  tab,
  agent,
  detail,
}: {
  tab: SheetTabName;
  agent: Agent;
  detail: AgentDetailMessage | null;
}) {
  if (tab === "overview") return <OverviewTab agent={agent} />;
  if (tab === "personality") return <PersonalityTab agent={agent} detail={detail} />;
  if (!detail) return <EmptyNote>Waiting for {agent.name}'s details from the server…</EmptyNote>;
  if (tab === "thoughts") return <ThoughtsTab detail={detail} />;
  if (tab === "relations") return <RelationsTab detail={detail} />;
  if (tab === "memory") return <MemoryTab detail={detail} />;
  return <PromptsTab detail={detail} />;
}

/** The selected agent's sheet: a short status header over tabbed pages, like a unit sheet. */
export function CharacterSheet() {
  const { state } = usePanelContext();
  const [activeTab, setActiveTab] = useState<SheetTabName>("overview");
  const agent = findAgent(state, state.inspectedAgentId);
  if (!agent) return <EmptyNote>Click an agent on the map or in the roster above.</EmptyNote>;
  const detail = state.agentDetail?.agentId === agent.id ? state.agentDetail : null;
  const tabs = SHEET_TABS.map((tab) => ({
    name: tab.name,
    label:
      TABS_NEEDING_DETAIL.has(tab.name) && detail === null ? (
        <span className="muted">{tab.label}</span>
      ) : (
        tab.label
      ),
  }));
  return (
    <div className="character-sheet">
      <SheetHeader agent={agent} />
      <TabBar className="sheet-tabs" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="sheet-body">
        <SheetBody tab={activeTab} agent={agent} detail={detail} />
      </div>
    </div>
  );
}
