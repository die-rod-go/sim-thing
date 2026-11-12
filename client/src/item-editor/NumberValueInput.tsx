import type { NumberValue } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import type { ValueSpot } from "./step-owner";
import {
  findNumberValueMode,
  findNumberValueTimes,
  setNumberValueTimes,
  switchNumberValueMode,
  VALUE_MODE_LABELS,
  type ValueMode,
} from "./value-modes";
import { listReadablePaths, type ValueKind } from "./value-scope";
import { Checkbox, Choice } from "./widgets";

const { numberStep, defaultTimesFactor } = clientConfig.itemEditor;

type TimesKind = "none" | "number" | "field";
const TIMES_LABELS: Record<TimesKind, string> = {
  none: "no factor",
  number: "times a number",
  field: "times a field",
};

function findTimesKind(times: number | string | undefined): TimesKind {
  if (times === undefined) return "none";
  return typeof times === "number" ? "number" : "field";
}

function TimesInput({
  value,
  onChange,
  spot,
}: {
  value: Exclude<NumberValue, number>;
  onChange: (value: NumberValue) => void;
  spot: ValueSpot;
}) {
  const times = findNumberValueTimes(value);
  const kind = findTimesKind(times);
  const paths = listReadablePaths(spot, "factor");
  const kinds: TimesKind[] =
    paths.length > 0 || kind === "field" ? ["none", "number", "field"] : ["none", "number"];
  const changeKind = (next: TimesKind) => {
    if (next === "none") onChange(setNumberValueTimes(value, undefined));
    else if (next === "number") onChange(setNumberValueTimes(value, defaultTimesFactor));
    else onChange(setNumberValueTimes(value, paths[0] ?? ""));
  };
  return (
    <>
      <Choice value={kind} choices={kinds} labels={TIMES_LABELS} onChange={changeKind} />
      {typeof times === "number" && (
        <NumberInput
          value={times}
          step={numberStep}
          onChange={(next) => onChange(setNumberValueTimes(value, next))}
        />
      )}
      {typeof times === "string" && (
        <Choice
          value={times}
          choices={paths}
          onChange={(next) => onChange(setNumberValueTimes(value, next))}
        />
      )}
    </>
  );
}

/** The shared core: the modes allowed, what a read may name, and whether a factor is offered. */
export function NumberValueCore({
  value,
  onChange,
  spot,
  modes,
  readKind,
  showsTimes,
}: {
  value: NumberValue;
  onChange: (value: NumberValue) => void;
  spot: ValueSpot;
  modes: readonly ValueMode[];
  readKind: ValueKind;
  showsTimes: boolean;
}) {
  const mode = findNumberValueMode(value);
  const paths = listReadablePaths(spot, readKind);
  const offered = modes.filter((candidate) =>
    candidate === "from" ? paths.length > 0 || mode === "from" : true,
  );
  return (
    <span className="value-input">
      {offered.length > 1 && (
        <Choice
          value={mode}
          choices={offered}
          labels={VALUE_MODE_LABELS}
          onChange={(next) => onChange(switchNumberValueMode(value, next, paths[0] ?? ""))}
        />
      )}
      {typeof value === "number" && (
        <NumberInput value={value} step={numberStep} onChange={onChange} />
      )}
      {typeof value === "object" && "min" in value && (
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
      {typeof value === "object" && "from" in value && (
        <Choice
          value={value.from}
          choices={paths}
          onChange={(from) => onChange({ ...value, from })}
        />
      )}
      {showsTimes && typeof value === "object" && (
        <TimesInput value={value} onChange={onChange} spot={spot} />
      )}
    </span>
  );
}

const NUMBER_MODES: readonly ValueMode[] = ["literal", "roll", "from"];

export function NumberValueInput({
  value,
  onChange,
  spot,
}: {
  value: NumberValue;
  onChange: (value: NumberValue) => void;
  spot: ValueSpot;
}) {
  return (
    <NumberValueCore
      value={value}
      onChange={onChange}
      spot={spot}
      modes={NUMBER_MODES}
      readKind="number"
      showsTimes
    />
  );
}

/** A number that may be left out: a "set" toggle and the input. */
export function OptionalNumberValueInput({
  value,
  onChange,
  spot,
  emptyLabel,
}: {
  value: NumberValue | undefined;
  onChange: (value: NumberValue | undefined) => void;
  spot: ValueSpot;
  emptyLabel: string;
}) {
  return (
    <span className="value-input">
      <Checkbox
        label={emptyLabel}
        checked={value !== undefined}
        onChange={(isSet) => onChange(isSet ? 0 : undefined)}
      />
      {value !== undefined && <NumberValueInput value={value} onChange={onChange} spot={spot} />}
    </span>
  );
}
