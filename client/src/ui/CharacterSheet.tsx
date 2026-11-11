import { useMemo } from "react";
import type { Agent, AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { findNewestThought } from "../format/agent-activity";
import { describeActivity, formatClockTime } from "../format/character-sheet";
import { parseStoredChoice } from "../format/stored-preferences";
import { summarizeLlmCall } from "../format/thoughts";
import { ActivityTab } from "./ActivityTab";
import { MemoryTab } from "./MemoryTab";
import { OverviewTab } from "./OverviewTab";
import { usePanelContext } from "./panel-context";
import { PersonalityTab } from "./PersonalityTab";
import { PromptsTab } from "./PromptsTab";
import { RelationsTab } from "./RelationsTab";
import { useStoredState } from "./use-stored-state";
import { ColorDot, EmptyNote, TabBar } from "./widgets";

const SHEET_TAB_NAMES = [
  "activity",
  "overview",
  "personality",
  "relations",
  "memory",
  "prompts",
] as const;

type SheetTabName = (typeof SHEET_TAB_NAMES)[number];

const SHEET_TAB_LABELS: Record<SheetTabName, string> = {
  activity: "Activity",
  overview: "Overview",
  personality: "Personality",
  relations: "Relations",
  memory: "Memory",
  prompts: "Prompts",
};

const TABS_NEEDING_DETAIL: ReadonlySet<SheetTabName> = new Set(["relations", "memory", "prompts"]);

const parseSheetTab = (raw: string | null) => parseStoredChoice(raw, SHEET_TAB_NAMES);

/** What the agent is doing, feeling, meaning to do and thinking right now; above every tab. */
function NowStrip({ agent, detail }: { agent: Agent; detail: AgentDetailMessage | null }) {
  const { state } = usePanelContext();
  const newestThought = useMemo(
    () => findNewestThought(detail ? detail.llmCalls.map(summarizeLlmCall) : [], agent.lastThought),
    [agent, detail],
  );
  return (
    <div className="now-strip">
      <p className="now-doing">
        {describeActivity(agent.currentAction, state.timeSettings)} at{" "}
        <strong>{agent.place}</strong>, feeling <em className="mood">{agent.mood}</em>
      </p>
      {agent.intention && (
        <p className="now-intention">
          <span className="now-label">intends</span> {agent.intention}
        </p>
      )}
      {newestThought && (
        <p className="now-thought">
          <span className="now-label">thinks</span>
          <span className="now-thought-text">{newestThought.text}</span>
          <span className="line-time">
            {formatClockTime(newestThought.tick, state.timeSettings)}
          </span>
        </p>
      )}
    </div>
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
  if (tab === "activity") return <ActivityTab agent={agent} detail={detail} />;
  if (tab === "overview") return <OverviewTab agent={agent} />;
  if (tab === "personality") return <PersonalityTab agent={agent} detail={detail} />;
  if (!detail) return <EmptyNote>Waiting for {agent.name}'s details from the server…</EmptyNote>;
  if (tab === "relations") return <RelationsTab detail={detail} />;
  if (tab === "memory") return <MemoryTab detail={detail} />;
  return <PromptsTab detail={detail} />;
}

/** The selected agent's sheet: a sticky "now" header over tabbed pages, activity first. */
export function CharacterSheet({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { state } = usePanelContext();
  const [activeTab, setActiveTab] = useStoredState<SheetTabName>(
    clientConfig.storageKeys.sheetTab,
    "activity",
    parseSheetTab,
  );
  const detail = state.agentDetail?.agentId === agent.id ? state.agentDetail : null;
  const tabs = SHEET_TAB_NAMES.map((tabName) => ({
    name: tabName,
    label:
      TABS_NEEDING_DETAIL.has(tabName) && detail === null ? (
        <span className="muted">{SHEET_TAB_LABELS[tabName]}</span>
      ) : (
        SHEET_TAB_LABELS[tabName]
      ),
  }));
  return (
    <div className="character-sheet">
      <header className="sheet-header">
        <div className="sheet-title">
          <ColorDot agentId={agent.id} />
          <h2>{agent.name}</h2>
          <span className="sheet-profession">{agent.profession}</span>
          <button className="icon-button sheet-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
        <NowStrip agent={agent} detail={detail} />
        <TabBar className="sheet-tabs" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </header>
      <div className="sheet-body">
        <SheetBody tab={activeTab} agent={agent} detail={detail} />
      </div>
    </div>
  );
}
