import type { ReactNode } from "react";
import type { NumberValue, RangeValue, TextValue } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  findNumberValueMode,
  findRangeValueMode,
  findTextValueMode,
  switchNumberValueMode,
  switchRangeValueMode,
  switchTextValueMode,
  VALUE_MODE_LABELS,
  type ValueMode,
} from "./value-modes";
import { Choice, SuggestingInput } from "./widgets";

/** The component fields a verb may read, by field type; all empty outside verbs. */
export interface ReadablePaths {
  number: string[];
  range: string[];
  text: string[];
}

export const NO_READABLE_PATHS: ReadablePaths = { number: [], range: [], text: [] };

const { numberStep } = clientConfig.itemEditor;

function PathSelect({
  value,
  paths,
  onChange,
}: {
  value: string;
  paths: readonly string[];
  onChange: (path: string) => void;
}) {
  return <Choice value={value} choices={paths} onChange={onChange} />;
}

function ModeSelect({
  mode,
  modes,
  onChange,
}: {
  mode: ValueMode;
  modes: readonly ValueMode[];
  onChange: (mode: ValueMode) => void;
}) {
  // Only offered when a component can be read; a value that already reads one keeps its mode.
  if (modes.length <= 1 && mode === "literal") return null;
  return <Choice value={mode} choices={modes} labels={VALUE_MODE_LABELS} onChange={onChange} />;
}

export function NumberValueInput({
  value,
  onChange,
  paths,
}: {
  value: NumberValue;
  onChange: (value: NumberValue) => void;
  paths: ReadablePaths;
}) {
  const mode = findNumberValueMode(value);
  const firstPath = paths.number[0] ?? "";
  const modes: ValueMode[] = paths.number.length > 0 ? ["literal", "from", "times"] : ["literal"];
  return (
    <span className="value-input">
      {typeof value === "number" && (
        <NumberInput value={value} step={numberStep} onChange={onChange} />
      )}
      {typeof value === "object" && "value" in value && (
        <NumberInput
          value={value.value}
          step={numberStep}
          onChange={(literal) => onChange({ ...value, value: literal })}
        />
      )}
      <ModeSelect
        mode={mode}
        modes={modes}
        onChange={(next) => onChange(switchNumberValueMode(value, next, firstPath))}
      />
      {typeof value === "object" && "from" in value && (
        <PathSelect
          value={value.from}
          paths={paths.number}
          onChange={(from) => onChange({ from })}
        />
      )}
      {typeof value === "object" && "times" in value && (
        <PathSelect
          value={value.times}
          paths={paths.number}
          onChange={(times) => onChange({ ...value, times })}
        />
      )}
    </span>
  );
}

export function RangeValueInput({
  value,
  onChange,
  paths,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  paths: ReadablePaths;
}) {
  const mode = findRangeValueMode(value);
  const modes: ValueMode[] = [
    "literal",
    ...(paths.range.length > 0 ? (["from"] as const) : []),
    ...(paths.number.length > 0 ? (["times"] as const) : []),
  ];
  const switchPaths = { rangePath: paths.range[0] ?? "", numberPath: paths.number[0] ?? "" };
  return (
    <span className="value-input">
      {!("from" in value) && (
        <>
          <NumberInput
            value={value.min}
            step={numberStep}
            onChange={(min) => onChange({ ...value, min })}
          />
          –
          <NumberInput
            value={value.max}
            step={numberStep}
            onChange={(max) => onChange({ ...value, max })}
          />
        </>
      )}
      <ModeSelect
        mode={mode}
        modes={modes}
        onChange={(next) => onChange(switchRangeValueMode(value, next, switchPaths))}
      />
      {"from" in value && (
        <PathSelect
          value={value.from}
          paths={paths.range}
          onChange={(from) => onChange({ from })}
        />
      )}
      {!("from" in value) && value.times !== undefined && (
        <PathSelect
          value={value.times}
          paths={paths.number}
          onChange={(times) => onChange({ ...value, times })}
        />
      )}
    </span>
  );
}

/** A stimulus: one already used in the file, a new name, or (in verbs) a text field. */
export function StimulusInput({
  value,
  onChange,
  stimuli,
  paths,
}: {
  value: TextValue;
  onChange: (value: TextValue) => void;
  stimuli: readonly string[];
  paths: ReadablePaths;
}) {
  const mode = findTextValueMode(value);
  const modes: ValueMode[] = paths.text.length > 0 ? ["literal", "from"] : ["literal"];
  return (
    <span className="value-input">
      {typeof value === "string" ? (
        <SuggestingInput value={value} suggestions={stimuli} onChange={onChange} />
      ) : (
        <PathSelect value={value.from} paths={paths.text} onChange={(from) => onChange({ from })} />
      )}
      {modes.length > 1 && (
        <Choice
          value={mode}
          choices={modes}
          labels={{ literal: "name" }}
          onChange={(next) => onChange(switchTextValueMode(value, next, paths.text[0] ?? ""))}
        />
      )}
    </span>
  );
}

/** A checkbox that adds or removes an optional value, with the value's input when present. */
export function OptionalValue({
  isSet,
  onToggle,
  label,
  children,
}: {
  isSet: boolean;
  onToggle: (isSet: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="value-input">
      <input
        type="checkbox"
        title={`Set ${label}`}
        checked={isSet}
        onChange={(event) => onToggle(event.target.checked)}
      />
      {isSet ? children : <span className="muted">none</span>}
    </span>
  );
}
