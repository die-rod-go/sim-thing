import { useCallback, useMemo, useState } from "react";
import { clientConfig } from "../client-config";
import { buildAgentColors } from "../format/agent-colors";
import { groupConversations } from "../format/conversations";
import { cycleAgentId, type ShortcutAction } from "../format/shortcuts";
import { VillageView, type CameraFocus } from "../village/VillageView";
import { PanelContext, type PanelContextValue } from "./panel-context";
import { PanelResizer } from "./PanelResizer";
import { RosterRail } from "./RosterRail";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";
import { useShellLayout, type ShellLayout } from "./use-shell-layout";
import { useShortcuts } from "./use-shortcuts";
import { useSimClient, type SimClient } from "./use-sim-client";

const NO_AGENTS: readonly string[] = [];

function useShortcutHandler(simClient: SimClient, toggleShortcutsHelp: () => void) {
  const { state, sendControl, selectAgent } = simClient;
  return useCallback(
    (action: ShortcutAction) => {
      const isLive = state.hasSnapshot;
      switch (action.kind) {
        case "toggle_pause":
          if (isLive) sendControl({ type: state.clock.isPaused ? "resume" : "pause" });
          return;
        case "step":
          if (isLive && state.clock.isPaused) sendControl({ type: "step" });
          return;
        case "set_speed_option": {
          const speed = state.speedOptions[action.optionIndex];
          if (isLive && speed !== undefined) sendControl({ type: "set_speed", speed });
          return;
        }
        case "cycle_agent": {
          const agentIds = state.agents.map((agent) => agent.id);
          selectAgent(cycleAgentId(agentIds, state.inspectedAgentId, action.direction));
          return;
        }
        case "deselect":
          if (state.inspectedAgentId !== null) selectAgent(null);
          return;
        case "toggle_help":
          toggleShortcutsHelp();
          return;
      }
    },
    [state, sendControl, selectAgent, toggleShortcutsHelp],
  );
}

export function App() {
  const simClient = useSimClient();
  const { state, selectAgent } = simClient;
  const layout = useShellLayout();
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [cameraFocus, setCameraFocus] = useState<CameraFocus | null>(null);
  const [highlightedAgentIds, setHighlightedAgentIds] = useState<readonly string[]>(NO_AGENTS);

  const toggleShortcutsHelp = useCallback(() => setIsShortcutsHelpOpen((isOpen) => !isOpen), []);
  useShortcuts(useShortcutHandler(simClient, toggleShortcutsHelp));

  const agentColors = useMemo(() => buildAgentColors(state.agents), [state.agents]);
  const threads = useMemo(
    () => groupConversations(state.events, clientConfig.conversations.maxGapTicks),
    [state.events],
  );
  const focusThread = useCallback((agentIds: readonly string[]) => {
    setCameraFocus((previous) => ({
      agentIds: [...agentIds],
      requestId: (previous?.requestId ?? 0) + 1,
    }));
  }, []);
  const highlightAgents = useCallback((agentIds: readonly string[]) => {
    setHighlightedAgentIds(agentIds.length === 0 ? NO_AGENTS : agentIds);
  }, []);
  const contextValue = useMemo<PanelContextValue>(
    () => ({ state, agentColors, threads, selectAgent, focusThread, highlightAgents }),
    [state, agentColors, threads, selectAgent, focusThread, highlightAgents],
  );

  return (
    <PanelContext.Provider value={contextValue}>
      <div className="app">
        <TopBar
          state={state}
          connectionStatus={simClient.connectionStatus}
          protocolError={simClient.protocolError}
          isDebugOverlayOn={simClient.isDebugOverlayOn}
          onDebugOverlayChange={simClient.setDebugOverlayOn}
          sendControl={simClient.sendControl}
          isShortcutsHelpOpen={isShortcutsHelpOpen}
          onShortcutsHelpChange={setIsShortcutsHelpOpen}
        />
        <main className="app-body">
          <RosterRail
            isCollapsed={layout.isRosterCollapsed}
            onCollapsedChange={layout.setIsRosterCollapsed}
          />
          <VillageView
            state={state}
            isDebugOverlayOn={simClient.isDebugOverlayOn}
            onSelectAgent={selectAgent}
            sendControl={simClient.sendControl}
            cameraFocus={cameraFocus}
            highlightedAgentIds={highlightedAgentIds}
          />
          <SidePanelDock layout={layout} />
        </main>
      </div>
    </PanelContext.Provider>
  );
}

function SidePanelDock({ layout }: { layout: ShellLayout }) {
  if (layout.isSidePanelCollapsed) {
    return (
      <div
        className="side-panel-collapsed"
        style={{ width: clientConfig.shell.collapsedRailWidthPx }}
      >
        <button
          className="icon-button"
          onClick={() => layout.setIsSidePanelCollapsed(false)}
          title="Show the side panel"
        >
          «
        </button>
      </div>
    );
  }
  return (
    <div className="side-panel-dock" style={{ width: layout.sidePanelWidth }}>
      <PanelResizer width={layout.sidePanelWidth} onWidthChange={layout.setSidePanelWidth} />
      <button
        className="icon-button panel-collapse"
        onClick={() => layout.setIsSidePanelCollapsed(true)}
        title="Hide the side panel"
      >
        »
      </button>
      <SidePanel />
    </div>
  );
}
