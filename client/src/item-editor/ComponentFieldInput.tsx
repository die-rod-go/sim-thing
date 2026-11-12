import type { FieldDeclaration, FieldValue } from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { Checkbox } from "./widgets";

const { numberStep } = clientConfig.itemEditor;

export function formatFieldValue(value: FieldValue): string {
  if (typeof value === "object") return `${value.min} – ${value.max}`;
  return value === "" ? "empty text" : String(value);
}

function ItemChoice({
  value,
  definitionIds,
  onChange,
}: {
  value: string;
  definitionIds: readonly string[];
  onChange: (value: string) => void;
}) {
  const options = definitionIds.includes(value) ? definitionIds : [value, ...definitionIds];
  return (
    <select
      className="editor-input item-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option === "" ? "choose an item" : option}
        </option>
      ))}
    </select>
  );
}

/** An input that fits the field's declared type; a value of the wrong type starts over. */
export function FieldValueInput({
  field,
  value,
  definitionIds,
  onChange,
}: {
  field: FieldDeclaration;
  value: FieldValue;
  definitionIds: readonly string[];
  onChange: (value: FieldValue) => void;
}) {
  if (field.type === "number") {
    return (
      <NumberInput
        value={typeof value === "number" ? value : 0}
        step={numberStep}
        onChange={onChange}
      />
    );
  }
  if (field.type === "boolean") {
    return <Checkbox label="" checked={value === true} onChange={onChange} />;
  }
  if (field.type === "text") {
    return <TextInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
  }
  if (field.type === "item") {
    return (
      <ItemChoice
        value={typeof value === "string" ? value : ""}
        definitionIds={definitionIds}
        onChange={onChange}
      />
    );
  }
  const range = typeof value === "object" ? value : { min: 0, max: 0 };
  return (
    <span className="value-input">
      <NumberInput
        value={range.min}
        step={numberStep}
        onChange={(min) => onChange({ ...range, min })}
      />
      –
      <NumberInput
        value={range.max}
        step={numberStep}
        onChange={(max) => onChange({ ...range, max })}
      />
    </span>
  );
}
