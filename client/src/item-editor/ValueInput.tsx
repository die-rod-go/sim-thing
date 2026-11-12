import type {
  DefinitionValue,
  FieldDeclaration,
  FieldValueInput,
  NumberValue,
  TextValue,
} from "@village/shared";
import type { ReactNode } from "react";
import { TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { NumberValueCore, NumberValueInput } from "./NumberValueInput";
import { DefinitionPicker } from "./pickers";
import type { ValueSpot } from "./step-owner";
import {
  findSimpleValueMode,
  SIMPLE_VALUE_MODE_LABELS,
  switchSimpleValueMode,
  type ValueMode,
} from "./value-modes";
import { listReadablePaths, type ValueKind } from "./value-scope";
import { Checkbox, Choice, SuggestingInput } from "./widgets";

export { NumberValueInput, OptionalNumberValueInput } from "./NumberValueInput";

function isRead(value: unknown): value is { from: string } {
  return typeof value === "object" && value !== null && "from" in value;
}

/** A literal of any type, or a read of a field of the right type; the literal is drawn by `renderLiteral`. */
function SimpleValueCore<Literal>({
  value,
  onChange,
  spot,
  kind,
  startLiteral,
  renderLiteral,
}: {
  value: Literal | { from: string };
  onChange: (value: Literal | { from: string }) => void;
  spot: ValueSpot;
  kind: ValueKind;
  startLiteral: Literal;
  renderLiteral: (literal: Literal, onLiteralChange: (literal: Literal) => void) => ReactNode;
}) {
  const mode = findSimpleValueMode(value);
  const paths = listReadablePaths(spot, kind);
  const canRead = paths.length > 0 || mode === "from";
  return (
    <span className="value-input">
      {canRead && (
        <Choice
          value={mode}
          choices={["literal", "from"]}
          labels={SIMPLE_VALUE_MODE_LABELS}
          onChange={(next) => onChange(switchSimpleValueMode(next, paths[0] ?? "", startLiteral))}
        />
      )}
      {isRead(value) ? (
        <Choice value={value.from} choices={paths} onChange={(from) => onChange({ from })} />
      ) : (
        renderLiteral(value, onChange)
      )}
    </span>
  );
}

export function TextValueInput({
  value,
  onChange,
  spot,
  suggestions = [],
}: {
  value: TextValue;
  onChange: (value: TextValue) => void;
  spot: ValueSpot;
  suggestions?: readonly string[];
}) {
  return (
    <SimpleValueCore<string>
      value={value}
      onChange={onChange}
      spot={spot}
      kind="text"
      startLiteral={clientConfig.itemEditor.newTextValue}
      renderLiteral={(literal, onLiteralChange) => (
        <SuggestingInput value={literal} suggestions={suggestions} onChange={onLiteralChange} />
      )}
    />
  );
}

export function DefinitionValueInput({
  value,
  onChange,
  spot,
}: {
  value: DefinitionValue;
  onChange: (value: DefinitionValue) => void;
  spot: ValueSpot;
}) {
  return (
    <SimpleValueCore<string>
      value={value}
      onChange={onChange}
      spot={spot}
      kind="definition"
      startLiteral={spot.file.definitions[0]?.id ?? clientConfig.itemEditor.newDefinitionId}
      renderLiteral={(literal, onLiteralChange) => (
        <DefinitionPicker value={literal} file={spot.file} onChange={onLiteralChange} />
      )}
    />
  );
}

const RANGE_MODES: readonly ValueMode[] = ["roll", "from"];

function toNumberValue(value: FieldValueInput): NumberValue {
  return typeof value === "number" || (typeof value === "object" && value !== null) ? value : 0;
}

function toTextValue(value: FieldValueInput): TextValue {
  if (typeof value === "string") return value;
  return isRead(value) ? { from: value.from } : "";
}

function toBooleanValue(value: FieldValueInput): boolean | { from: string } {
  if (typeof value === "boolean") return value;
  return isRead(value) ? { from: value.from } : false;
}

function BooleanValueInput({
  value,
  onChange,
  spot,
}: {
  value: boolean | { from: string };
  onChange: (value: boolean | { from: string }) => void;
  spot: ValueSpot;
}) {
  return (
    <SimpleValueCore<boolean>
      value={value}
      onChange={onChange}
      spot={spot}
      kind="boolean"
      startLiteral={false}
      renderLiteral={(literal, onLiteralChange) => (
        <Checkbox label={literal ? "yes" : "no"} checked={literal} onChange={onLiteralChange} />
      )}
    />
  );
}

/** The input that fits a declared field's type; an unknown field takes literal text. */
export function FieldSlotValueInput({
  value,
  onChange,
  spot,
  field,
}: {
  value: FieldValueInput;
  onChange: (value: FieldValueInput) => void;
  spot: ValueSpot;
  field: FieldDeclaration | undefined;
}) {
  if (field?.type === "number") {
    return <NumberValueInput value={toNumberValue(value)} onChange={onChange} spot={spot} />;
  }
  if (field?.type === "range") {
    const rolled =
      typeof value === "object" && ("min" in value || "from" in value)
        ? toNumberValue(value)
        : { min: 0, max: 0 };
    return (
      <NumberValueCore
        value={rolled}
        onChange={onChange}
        spot={spot}
        modes={RANGE_MODES}
        readKind="range"
        showsTimes={false}
      />
    );
  }
  if (field?.type === "boolean") {
    return <BooleanValueInput value={toBooleanValue(value)} onChange={onChange} spot={spot} />;
  }
  if (field?.type === "text") {
    return <TextValueInput value={toTextValue(value)} onChange={onChange} spot={spot} />;
  }
  if (field?.type === "item") {
    return <DefinitionValueInput value={toTextValue(value)} onChange={onChange} spot={spot} />;
  }
  return <TextInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
}
