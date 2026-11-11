import { useEffect, useId, useState, type ReactNode } from "react";
import type { SeedProblem, TraitName } from "@village/shared";
import { describeTrait } from "../format/character-sheet";
import { clientConfig } from "../client-config";

export function ProblemList({ problems }: { problems: readonly SeedProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="problem-list">
      {problems.map((problem) => (
        <li key={`${problem.field}-${problem.message}`} className={`problem-${problem.severity}`}>
          {problem.message}
        </li>
      ))}
    </ul>
  );
}

export function Field({
  label,
  hint,
  problems = [],
  children,
}: {
  label: string;
  hint?: ReactNode;
  problems?: readonly SeedProblem[];
  children: (inputId: string) => ReactNode;
}) {
  const inputId = useId();
  return (
    <div className="editor-field">
      <label htmlFor={inputId}>{label}</label>
      {children(inputId)}
      {hint !== undefined && <p className="field-hint">{hint}</p>}
      <ProblemList problems={problems} />
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      className="editor-input"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A text input that only reports its value when it loses focus or Enter is pressed. */
export function CommittedTextInput({
  id,
  value,
  onCommit,
  placeholder,
}: {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      id={id}
      className="editor-input"
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = clientConfig.characterEditor.defaultTextAreaRows,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      className="editor-input editor-textarea"
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A number input that keeps whatever is typed, and reports only values that parse. */
export function NumberInput({
  id,
  value,
  onChange,
  step,
  min,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);
  return (
    <input
      id={id}
      className="editor-input editor-number"
      type="number"
      value={text}
      step={step}
      min={min}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}

export function TraitSlider({
  traitName,
  value,
  range,
  onChange,
}: {
  traitName: TraitName;
  value: number;
  range: { min: number; max: number };
  onChange: (value: number) => void;
}) {
  const description = describeTrait(traitName, value);
  const [lowWord, highWord] = clientConfig.traitWords.poles[traitName];
  return (
    <div className="trait-slider">
      <div className="trait-slider-heading">
        <span className="trait-name">{traitName}</span>
        <span className={`trait-phrase intensity-${description.intensity}`}>
          {description.phrase}
        </span>
        <span className="trait-value">{value.toFixed(2)}</span>
      </div>
      <div className="trait-slider-control">
        <span className="trait-pole">{lowWord}</span>
        <input
          className="trait-range"
          type="range"
          aria-label={traitName}
          min={range.min}
          max={range.max}
          step={clientConfig.characterEditor.traitStep}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="trait-pole">{highWord}</span>
      </div>
    </div>
  );
}
