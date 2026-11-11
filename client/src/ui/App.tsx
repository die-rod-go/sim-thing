import { VillageView } from "../village/VillageView";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";
import { useSimClient } from "./use-sim-client";

export function App() {
  const simClient = useSimClient();
  return (
    <div className="app">
      <TopBar
        state={simClient.state}
        connectionStatus={simClient.connectionStatus}
        protocolError={simClient.protocolError}
        isDebugOverlayOn={simClient.isDebugOverlayOn}
        onDebugOverlayChange={simClient.setDebugOverlayOn}
        sendControl={simClient.sendControl}
      />
      <main className="app-body">
        <VillageView
          state={simClient.state}
          isDebugOverlayOn={simClient.isDebugOverlayOn}
          onSelectAgent={simClient.selectAgent}
        />
        <SidePanel state={simClient.state} onSelectAgent={simClient.selectAgent} />
      </main>
    </div>
  );
}
