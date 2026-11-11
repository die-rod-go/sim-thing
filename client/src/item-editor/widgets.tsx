import { useId, type ReactNode } from "react";
import type { ItemProblem } from "@village/shared";

export function ItemProblemList({
  problems,
  showsPath = false,
}: {
  problems: readonly ItemProblem[];
  showsPath?: boolean;
}) {
  if (problems.length === 0) return null;
  return (
    <ul className="problem-list">
      {problems.map((problem, index) => (
        <li key={`${index}-${problem.path}`} className={`problem-${problem.severity}`}>
          {showsPath ? `${problem.path}: ${problem.message}` : problem.message}
        </li>
      ))}
    </ul>
  );
}

export function Choice<Value extends string>({
  value,
  choices,
  onChange,
  labels,
  title,
}: {
  value: Value;
  choices: readonly Value[];
  onChange: (value: Value) => void;
  labels?: Partial<Record<Value, string>>;
  title?: string;
}) {
  const options = choices.includes(value) ? choices : [value, ...choices];
  return (
    <select
      className="editor-input item-select"
      value={value}
      title={title}
      onChange={(event) => {
        const chosen = options.find((option) => option === event.target.value);
        if (chosen !== undefined) onChange(chosen);
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="item-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** A label and its input on one line, for the dense verb and effect rows. */
export function InlineField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-field">
      <span className="inline-label">{label}</span>
      {children}
    </span>
  );
}

/** Removable chips for a list of names, with a picker of the ones not chosen yet. */
export function Chips({
  values,
  options,
  onChange,
}: {
  values: readonly string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const remaining = options.filter((option) => !values.includes(option));
  return (
    <span className="chip-row">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
          <button
            className="icon-button"
            title={`Remove ${value}`}
            onClick={() => onChange(values.filter((current) => current !== value))}
          >
            ×
          </button>
        </span>
      ))}
      {remaining.length > 0 && (
        <select
          className="editor-input item-select"
          value=""
          onChange={(event) => onChange([...values, event.target.value])}
        >
          <option value="">+ add</option>
          {remaining.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/** A text input offering known names (stimuli, say) while still taking a new one. */
export function SuggestingInput({
  value,
  suggestions,
  onChange,
  placeholder,
}: {
  value: string;
  suggestions: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        className="editor-input item-text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}

export interface SideListEntry {
  label: string;
  detail?: string;
  severity: "error" | "warning" | null;
}

/** The left-hand list of a tab, styled like the character editor's list. */
export function SideList({
  entries,
  selectedIndex,
  onSelect,
}: {
  entries: readonly SideListEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="character-list">
      {entries.map((entry, index) => (
        <li key={index}>
          <button
            className={index === selectedIndex ? "character-item is-active" : "character-item"}
            onClick={() => onSelect(index)}
          >
            <span className="character-item-text">
              <span className="character-item-name">{entry.label || "Unnamed"}</span>
              {entry.detail !== undefined && (
                <span className="character-item-work">{entry.detail}</span>
              )}
            </span>
            {entry.severity !== null && (
              <span className={`problem-marker has-${entry.severity}s`} />
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function findWorstSeverity(problems: readonly ItemProblem[]): "error" | "warning" | null {
  if (problems.some((problem) => problem.severity === "error")) return "error";
  return problems.length > 0 ? "warning" : null;
}
