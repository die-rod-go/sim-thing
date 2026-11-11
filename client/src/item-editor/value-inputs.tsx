import type { NumberValue } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  findNumberValueMode,
  switchNumberValueMode,
  VALUE_MODE_LABELS,
  type ValueMode,
} from "./value-modes";
import { Choice } from "./widgets";

/** The component fields a verb may read, by field type. */
export interface ReadablePaths {
  number: string[];
  range: string[];
}

const { numberStep } = clientConfig.itemEditor;
const NO_TIMES = "(no factor)";

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
  const readable = [...paths.number, ...paths.range];
  const modes: ValueMode[] =
    readable.length > 0 ? ["literal", "from", "roll"] : ["literal", "roll"];
  const times = typeof value === "object" ? value.times : undefined;
  const setTimes = (next: string) => {
    if (typeof value !== "object") return;
    const { times: ignored, ...rest } = value;
    void ignored;
    onChange(next === NO_TIMES ? rest : { ...rest, times: next });
  };
  return (
    <span className="value-input">
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
      <Choice
        value={mode}
        choices={modes}
        labels={VALUE_MODE_LABELS}
        onChange={(next) => onChange(switchNumberValueMode(value, next, readable[0] ?? ""))}
      />
      {typeof value === "object" && "from" in value && (
        <PathSelect
          value={value.from}
          paths={readable}
          onChange={(from) => onChange({ ...value, from })}
        />
      )}
      {typeof value === "object" && paths.number.length > 0 && (
        <>
          ×
          <Choice
            value={typeof times === "string" ? times : NO_TIMES}
            choices={[NO_TIMES, ...paths.number]}
            onChange={setTimes}
          />
        </>
      )}
    </span>
  );
}
