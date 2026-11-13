import type { ClientMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { describeClockFace } from "../format/clock-face";
import { formatCount } from "../format/formatters";
import { parseStoredBoolean } from "../format/stored-preferences";
import type { ConnectionStatus } from "../net/sim-connection";
import type { ClientState } from "../state/client-state";
import { MomentToasts } from "./MomentToasts";
import { RunForControl } from "./RunForControl";
import { SettingsMenu } from "./SettingsMenu";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useStoredState } from "./use-stored-state";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected, retrying…",
};

const PERCENT = 100;

export interface TopBarProps {
  state: ClientState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDebugOverlayOn: boolean;
  onDebugOverlayChange: (isOn: boolean) => void;
  sendControl: (message: ClientMessage) => void;
  isShortcutsHelpOpen: boolean;
  onShortcutsHelpChange: (isOpen: boolean) => void;
}

function SimClock({ state }: { state: ClientState }) {
  if (!state.hasSnapshot) return <span className="sim-clock muted">—</span>;
  const face = describeClockFace(state.clock.tick, state.timeSettings, clientConfig.daylight);
  return (
    <span className="sim-clock" title={`tick ${state.clock.tick}`}>
      <span className={face.isDaytime ? "clock-icon is-day" : "clock-icon is-night"} aria-hidden>
        {face.isDaytime ? "☀" : "☾"}
      </span>
      {face.label}
    </span>
  );
}

interface TransportControlsProps {
  state: ClientState;
  isLive: boolean;
  sendControl: (message: ClientMessage) => void;
}

function TransportControls({ state, isLive, sendControl }: TransportControlsProps) {
  const { clock } = state;
  return (
    <div className="segmented" role="group" aria-label="Sim controls">
      <button
        className="segment transport-play"
        disabled={!isLive}
        onClick={() => sendControl({ type: clock.isPaused ? "resume" : "pause" })}
        title={clock.isPaused ? "Resume (Space)" : "Pause (Space)"}
      >
        {clock.isPaused ? "▶" : "❚❚"}
      </button>
      <button
        className="segment"
        disabled={!isLive || !clock.isPaused}
        onClick={() => sendControl({ type: "step" })}
        title="Step one tick (.)"
      >
        ▶|
      </button>
      {state.speedOptions.map((speed, speedIndex) => (
        <button
          key={speed}
          className={speed === clock.speed ? "segment is-active" : "segment"}
          disabled={!isLive}
          onClick={() => sendControl({ type: "set_speed", speed })}
          title={`Speed ${speed}x (${speedIndex + 1})`}
        >
          {speed}x
        </button>
      ))}
    </div>
  );
}

function describeUsageLevel(usedFraction: number, isOverBudget: boolean): string {
  if (isOverBudget) return "is-over";
  return usedFraction >= clientConfig.ui.tokenWarningFraction ? "is-warning" : "";
}

function StatusPill({
  state,
  connectionStatus,
}: {
  state: ClientState;
  connectionStatus: ConnectionStatus;
}) {
  const { stats } = state;
  const usedFraction =
    stats.dailyTokenBudget > 0 ? Math.min(stats.tokensToday / stats.dailyTokenBudget, 1) : 0;
  const tokenTitle = `Tokens today: ${formatCount(stats.tokensToday)} / ${formatCount(stats.dailyTokenBudget)}`;
  return (
    <div className="status-pill">
      <span
        className={`connection-dot connection-${connectionStatus}`}
        title={CONNECTION_LABELS[connectionStatus]}
        aria-label={CONNECTION_LABELS[connectionStatus]}
      />
      <span className="status-item" title="LLM calls in flight">
        <span className="muted">LLM</span> {stats.inFlightLlmCalls}
      </span>
      <span
        className={`token-usage ${describeUsageLevel(usedFraction, stats.isOverBudget)}`}
        title={tokenTitle}
      >
        <span className="muted">Tokens</span>
        <span className="token-track">
          <span className="token-fill" style={{ width: `${usedFraction * PERCENT}%` }} />
        </span>
        <span className="token-count">{formatCount(stats.tokensToday)}</span>
      </span>
    </div>
  );
}

/** Clock, transport and status up front; everything else behind the ⚙ menu. */
export function TopBar(props: TopBarProps) {
  const { state, connectionStatus, sendControl } = props;
  const isLive = connectionStatus === "open" && state.hasSnapshot;
  const [isNotifyingPersonalityChanges, setIsNotifyingPersonalityChanges] = useStoredState(
    clientConfig.storageKeys.isNotifyingPersonalityChanges,
    false,
    parseStoredBoolean,
  );
  return (
    <header className="top-bar-wrapper">
      <div className="top-bar">
        <SimClock state={state} />
        <TransportControls state={state} isLive={isLive} sendControl={sendControl} />
        <RunForControl isPaused={state.clock.isPaused} isLive={isLive} sendControl={sendControl} />
        <div className="top-bar-end">
          <StatusPill state={state} connectionStatus={connectionStatus} />
          <ShortcutsHelp
            isOpen={props.isShortcutsHelpOpen}
            onChange={props.onShortcutsHelpChange}
          />
          <SettingsMenu
            state={state}
            isLive={isLive}
            sendControl={sendControl}
            isDebugOverlayOn={props.isDebugOverlayOn}
            onDebugOverlayChange={props.onDebugOverlayChange}
            isNotifyingPersonalityChanges={isNotifyingPersonalityChanges}
            onNotifyingPersonalityChangesChange={setIsNotifyingPersonalityChanges}
          />
        </div>
      </div>
      {state.clock.isPaused && state.pausedReason && (
        <div className="banner banner-warning">Sim paused itself: {state.pausedReason}</div>
      )}
      {props.protocolError && <div className="banner banner-error">{props.protocolError}</div>}
      <MomentToasts isEnabled={isNotifyingPersonalityChanges} />
    </header>
  );
}
