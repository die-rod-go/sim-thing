import { useEffect, useState, type FormEvent } from "react";
import type { ClientMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatCountdown, parsePositiveInteger } from "../format/formatters";

const MILLISECONDS_PER_MINUTE = 60_000;

interface RunForControlProps {
  isPaused: boolean;
  isLive: boolean;
  sendControl: (message: ClientMessage) => void;
}

/**
 * A countdown kept in this browser tab: it resumes the sim, then sends a pause when it reaches
 * zero. Closing or reloading the tab drops it.
 */
export function RunForControl({ isPaused, isLive, sendControl }: RunForControlProps) {
  const [minutesText, setMinutesText] = useState("");
  const [endsAtEpochMs, setEndsAtEpochMs] = useState<number | null>(null);
  const [currentEpochMs, setCurrentEpochMs] = useState(() => Date.now());
  const parsedMinutes = parsePositiveInteger(minutesText);

  useEffect(() => {
    if (endsAtEpochMs === null) return;
    const checkCountdown = () => {
      const now = Date.now();
      setCurrentEpochMs(now);
      if (now < endsAtEpochMs) return;
      sendControl({ type: "pause" });
      setEndsAtEpochMs(null);
    };
    const interval = window.setInterval(checkCountdown, clientConfig.ui.runTimerRefreshMs);
    return () => window.clearInterval(interval);
  }, [endsAtEpochMs, sendControl]);

  const startCountdown = (event: FormEvent) => {
    event.preventDefault();
    if (parsedMinutes === null) return;
    const now = Date.now();
    setCurrentEpochMs(now);
    setEndsAtEpochMs(now + parsedMinutes * MILLISECONDS_PER_MINUTE);
    setMinutesText("");
    if (isPaused) sendControl({ type: "resume" });
  };

  if (endsAtEpochMs !== null) {
    return (
      <div className="run-for">
        <span className="run-for-countdown" title="Pauses the sim when it reaches zero">
          ⏱ {formatCountdown(endsAtEpochMs - currentEpochMs)}
        </span>
        <button onClick={() => setEndsAtEpochMs(null)} title="Cancel the countdown">
          ✕
        </button>
      </div>
    );
  }

  return (
    <form className="run-for" onSubmit={startCountdown}>
      <input
        aria-label="Minutes to run for before pausing"
        placeholder="Run for (min)"
        value={minutesText}
        onChange={(event) => setMinutesText(event.target.value)}
        disabled={!isLive}
      />
      <button type="submit" disabled={!isLive || parsedMinutes === null}>
        ⏱
      </button>
    </form>
  );
}
