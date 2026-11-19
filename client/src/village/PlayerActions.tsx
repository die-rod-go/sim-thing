import { useState, type FormEvent } from "react";
import type { PlayerAct, PlayerThing, PlayerVerbOption } from "@village/shared";
import { buildOptionAct, isOptionReady } from "./player-controls";

/** Sends an act for the played agent; false when nothing was sent. */
export type SendPlayerAct = (act: PlayerAct) => boolean;

function readPositiveNumber(text: string): number | undefined {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The extras an option asks for (whom it is aimed at, how many, how long, what words), then do it. */
function OptionForm({
  option,
  count,
  onAct,
  onDone,
}: {
  option: PlayerVerbOption;
  count: number;
  onAct: SendPlayerAct;
  onDone: () => void;
}) {
  const takes = new Set(option.takes);
  const [target, setTarget] = useState(option.targets?.[0] ?? "");
  const [amount, setAmount] = useState("1");
  const [minutes, setMinutes] = useState("");
  const [text, setText] = useState("");
  const hasNoTarget = option.targets !== null && option.targets.length === 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const choices = {
      ...(target === "" ? {} : { target }),
      amount: readPositiveNumber(amount),
      minutes: readPositiveNumber(minutes),
      text,
    };
    if (onAct(buildOptionAct(option, choices))) onDone();
  };
  return (
    <form className="player-option-form" onSubmit={submit}>
      {option.targets !== null && (
        <label>
          at
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {option.targets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasNoTarget && <span className="muted">Nothing here it could be aimed at.</span>}
      {takes.has("amount") && (
        <label>
          how many
          <input
            type="number"
            min={1}
            max={Math.max(count, 1)}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      )}
      {takes.has("minutes") && (
        <label>
          minutes
          <input
            type="number"
            min={1}
            placeholder="as long as needed"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
      )}
      {takes.has("text") && (
        <input
          type="text"
          placeholder="The words, exactly as they will read"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      <button type="submit" disabled={hasNoTarget}>
        {option.label}
      </button>
    </form>
  );
}

function OptionButton({
  option,
  count,
  onAct,
}: {
  option: PlayerVerbOption;
  count: number;
  onAct: SendPlayerAct;
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (isOptionReady(option)) {
    return (
      <button type="button" onClick={() => onAct(buildOptionAct(option, {}))}>
        {option.label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={isOpen ? "is-active" : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        {option.label}…
      </button>
      {isOpen && (
        <OptionForm option={option} count={count} onAct={onAct} onDone={() => setIsOpen(false)} />
      )}
    </>
  );
}

export function OptionButtons({
  options,
  count,
  onAct,
}: {
  options: readonly PlayerVerbOption[];
  count: number;
  onAct: SendPlayerAct;
}) {
  if (options.length === 0) return null;
  return (
    <div className="player-options">
      {options.map((option) => (
        <OptionButton key={option.label} option={option} count={count} onAct={onAct} />
      ))}
    </div>
  );
}

/** Things the agent sees or carries, each with what it can do with it, and what is inside. */
export function ThingList({
  things,
  emptyText,
  onAct,
}: {
  things: readonly PlayerThing[];
  emptyText: string;
  onAct: SendPlayerAct;
}) {
  if (things.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="player-things">
      {things.map((thing) => (
        <li key={`${thing.text}|${thing.details.join("|")}`}>
          <span className="player-thing-text">{thing.text}</span>
          {thing.details.length > 0 && <span className="muted"> ({thing.details.join(", ")})</span>}
          <OptionButtons options={thing.options} count={thing.count} onAct={onAct} />
          {thing.contents.length > 0 && (
            <ThingList things={thing.contents} emptyText="" onAct={onAct} />
          )}
        </li>
      ))}
    </ul>
  );
}
