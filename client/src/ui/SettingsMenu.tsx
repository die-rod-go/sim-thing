import { useState, type FormEvent } from "react";
import type { ClientMessage } from "@village/shared";
import { formatCount, parsePositiveInteger } from "../format/formatters";
import type { ClientState } from "../state/client-state";
import { usePopover } from "./use-popover";

interface SettingsMenuProps {
  state: ClientState;
  isLive: boolean;
  sendControl: (message: ClientMessage) => void;
  isDebugOverlayOn: boolean;
  onDebugOverlayChange: (isOn: boolean) => void;
  isNotifyingPersonalityChanges: boolean;
  onNotifyingPersonalityChangesChange: (isOn: boolean) => void;
}

function BudgetForm({
  state,
  isLive,
  sendControl,
}: Pick<SettingsMenuProps, "state" | "isLive" | "sendControl">) {
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
        disabled={!isLive}
      />
      <button type="submit" disabled={!isLive || parsedBudget === null}>
        Set
      </button>
    </form>
  );
}

/** Everything that isn't watched minute to minute: budget, debug overlay, editing, reset. */
export function SettingsMenu(props: SettingsMenuProps) {
  const popover = usePopover();
  const { isLive, sendControl } = props;

  const confirmReset = () => {
    const isConfirmed = window.confirm(
      "Reset the village? This wipes the saved sim and reseeds every agent.",
    );
    if (!isConfirmed) return;
    sendControl({ type: "reset" });
    popover.setIsOpen(false);
  };

  return (
    <div className="popover-anchor" ref={popover.containerRef}>
      <button
        className={popover.isOpen ? "icon-button is-active" : "icon-button"}
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.isOpen}
        title="Settings"
      >
        ⚙
      </button>
      {popover.isOpen && (
        <div className="popover settings-menu" role="menu">
          <section className="menu-section">
            <h4>Daily token budget</h4>
            <BudgetForm state={props.state} isLive={isLive} sendControl={sendControl} />
          </section>
          <section className="menu-section">
            <label className="toggle">
              <input
                type="checkbox"
                checked={props.isDebugOverlayOn}
                onChange={(event) => props.onDebugOverlayChange(event.target.checked)}
              />
              Perception overlay
            </label>
            <span className="menu-hint muted">
              Shades what the selected agent can see and hear.
            </span>
          </section>
          <section className="menu-section">
            <label className="toggle">
              <input
                type="checkbox"
                checked={props.isNotifyingPersonalityChanges}
                onChange={(event) =>
                  props.onNotifyingPersonalityChangesChange(event.target.checked)
                }
              />
              Notify me of personality changes
            </label>
            <span className="menu-hint muted">A small pop-up when someone's character shifts.</span>
          </section>
          <section className="menu-section">
            <a className="menu-link" href="/characters.html" target="_blank" rel="noreferrer">
              Edit characters ↗
            </a>
          </section>
          <section className="menu-section">
            <button className="danger menu-danger" disabled={!isLive} onClick={confirmReset}>
              Reset village…
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
