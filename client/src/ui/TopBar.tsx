import { useState, type FormEvent } from "react";
import { formatSimTime, type ClientMessage } from "@village/shared";
import { formatCount, parsePositiveInteger } from "../format/formatters";
import type { ConnectionStatus } from "../net/sim-connection";
import type { ClientState } from "../state/client-state";

interface TopBarProps {
  state: ClientState;
  connectionStatus: ConnectionStatus;
  protocolError: string | null;
  isDebugOverlayOn: boolean;
  onDebugOverlayChange: (isOn: boolean) => void;
  sendControl: (message: ClientMessage) => void;
}

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected, retrying…",
};

function BudgetForm({ state, sendControl, isEnabled }: BudgetFormProps) {
  const [budgetText, setBudgetText] = useState("");
  const parsedBudget = parsePositiveInteger(budgetText);

  const submitBudget = (event: FormEvent) => {
    event.preventDefault();
    if (parsedBudget === null) return;
    sendControl({ type: "update_settings", dailyTokenBudget: parsedBudget });
    setBudgetText("");
  };

  return (
    <form className="budget-form" onSubmit={submitBudget}>
      <input
        aria-label="Daily token budget"
        placeholder={formatCount(state.stats.dailyTokenBudget)}
        value={budgetText}
        onChange={(event) => setBudgetText(event.target.value)}
        disabled={!isEnabled}
      />
      <button type="submit" disabled={!isEnabled || parsedBudget === null}>
        Set budget
      </button>
    </form>
  );
}

interface BudgetFormProps {
  state: ClientState;
  sendControl: (message: ClientMessage) => void;
  isEnabled: boolean;
}

export function TopBar(props: TopBarProps) {
  const { state, connectionStatus, sendControl } = props;
  const isLive = connectionStatus === "open" && state.hasSnapshot;
  const { clock, stats } = state;

  const confirmReset = () => {
    const isConfirmed = window.confirm(
      "Reset the village? This wipes the saved sim and reseeds every agent.",
    );
    if (isConfirmed) sendControl({ type: "reset" });
  };

  return (
    <header className="top-bar-wrapper">
      <div className="top-bar">
        <span className={`connection connection-${connectionStatus}`}>
          {CONNECTION_LABELS[connectionStatus]}
        </span>
        <span className="sim-time">
          {state.hasSnapshot ? formatSimTime(clock.tick, state.timeSettings) : "—"}
        </span>
        <span className="muted">tick {clock.tick}</span>
        <div className="button-group">
          <button
            disabled={!isLive}
            onClick={() => sendControl({ type: clock.isPaused ? "resume" : "pause" })}
          >
            {clock.isPaused ? "Resume" : "Pause"}
          </button>
          <button
            disabled={!isLive || !clock.isPaused}
            onClick={() => sendControl({ type: "step" })}
          >
            Step
          </button>
        </div>
        <div className="button-group">
          {state.speedOptions.map((speed) => (
            <button
              key={speed}
              className={speed === clock.speed ? "is-active" : undefined}
              disabled={!isLive}
              onClick={() => sendControl({ type: "set_speed", speed })}
            >
              {speed}x
            </button>
          ))}
        </div>
        <span title="LLM calls in flight">LLM: {stats.inFlightLlmCalls}</span>
        <span className={stats.isOverBudget ? "over-budget" : undefined} title="Tokens used today">
          Tokens: {formatCount(stats.tokensToday)} / {formatCount(stats.dailyTokenBudget)}
        </span>
        <BudgetForm state={state} sendControl={sendControl} isEnabled={isLive} />
        <label className="toggle">
          <input
            type="checkbox"
            checked={props.isDebugOverlayOn}
            onChange={(event) => props.onDebugOverlayChange(event.target.checked)}
          />
          Perception overlay
        </label>
        <a className="link-button" href="/characters.html" target="_blank" rel="noreferrer">
          Edit characters
        </a>
        <button className="danger" disabled={!isLive} onClick={confirmReset}>
          Reset
        </button>
      </div>
      {clock.isPaused && state.pausedReason && (
        <div className="banner banner-warning">Sim paused itself: {state.pausedReason}</div>
      )}
      {props.protocolError && <div className="banner banner-error">{props.protocolError}</div>}
    </header>
  );
}
