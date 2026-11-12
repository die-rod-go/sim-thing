import { useEffect, useState } from "react";
import type {
  ComponentDeclaration,
  FieldBound,
  FieldDeclaration,
  FieldValue,
  FieldWord,
} from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  addFieldWord,
  changeFieldWord,
  listSiblingNumberFields,
  moveFieldWord,
  removeFieldWord,
} from "./component-edits";
import { buildDefaultFieldValue } from "./definition-edits";
import { Checkbox, Choice, InlineField } from "./widgets";

const { numberStep } = clientConfig.itemEditor;

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** A number that may be blank; blank reports undefined. */
function OptionalNumberInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(formatOptionalNumber(value));
  useEffect(() => {
    setText((current) =>
      current.trim() !== "" && Number(current) === value ? current : formatOptionalNumber(value),
    );
  }, [value]);
  return (
    <input
      className="editor-input editor-number"
      type="number"
      step={numberStep}
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (event.target.value.trim() === "") onChange(undefined);
        else if (Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}

function DefaultInput({
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
  if (typeof value === "number") {
    return <NumberInput value={value} step={numberStep} onChange={onChange} />;
  }
  if (typeof value === "boolean") {
    return <Checkbox label="true" checked={value} onChange={onChange} />;
  }
  if (typeof value === "object") {
    return (
      <>
        <NumberInput
          value={value.min}
          step={numberStep}
          onChange={(min) => onChange({ ...value, min })}
        />
        <span className="muted">to</span>
        <NumberInput
          value={value.max}
          step={numberStep}
          onChange={(max) => onChange({ ...value, max })}
        />
      </>
    );
  }
  if (field.type === "item") {
    return <Choice value={value} choices={definitionIds} onChange={onChange} />;
  }
  return <TextInput value={value} onChange={onChange} />;
}

function startingDefault(field: FieldDeclaration, definitionIds: readonly string[]): FieldValue {
  return field.type === "item" ? (definitionIds[0] ?? "") : buildDefaultFieldValue(field.type);
}

export function DefaultOption({
  field,
  definitionIds,
  onChange,
}: {
  field: FieldDeclaration;
  definitionIds: readonly string[];
  onChange: (value: FieldValue | undefined) => void;
}) {
  return (
    <div className="field-option">
      <Checkbox
        label="has a default"
        checked={field.default !== undefined}
        onChange={(hasDefault) =>
          onChange(hasDefault ? startingDefault(field, definitionIds) : undefined)
        }
      />
      {field.default !== undefined && (
        <DefaultInput
          field={field}
          value={field.default}
          definitionIds={definitionIds}
          onChange={onChange}
        />
      )}
    </div>
  );
}

const NO_BOUND = "none";
const LITERAL_BOUND = "number";
const FIELD_BOUND_PREFIX = "field:";

function describeBoundMode(bound: FieldBound | undefined): string {
  if (bound === undefined) return NO_BOUND;
  return typeof bound === "number" ? LITERAL_BOUND : `${FIELD_BOUND_PREFIX}${bound}`;
}

function BoundOption({
  label,
  bound,
  siblings,
  onChange,
}: {
  label: string;
  bound: FieldBound | undefined;
  siblings: readonly string[];
  onChange: (bound: FieldBound | undefined) => void;
}) {
  const unknownName = typeof bound === "string" && !siblings.includes(bound) ? [bound] : [];
  return (
    <InlineField label={label}>
      <select
        className="editor-input item-select"
        value={describeBoundMode(bound)}
        onChange={(event) => {
          const chosen = event.target.value;
          if (chosen === NO_BOUND) onChange(undefined);
          else if (chosen === LITERAL_BOUND) onChange(0);
          else onChange(chosen.slice(FIELD_BOUND_PREFIX.length));
        }}
      >
        <option value={NO_BOUND}>none</option>
        <option value={LITERAL_BOUND}>a number</option>
        {[...unknownName, ...siblings].map((name) => (
          <option key={name} value={`${FIELD_BOUND_PREFIX}${name}`}>
            the field {name}
          </option>
        ))}
      </select>
      {typeof bound === "number" && (
        <NumberInput value={bound} step={numberStep} onChange={onChange} />
      )}
    </InlineField>
  );
}

function WordsOption({
  words,
  onChange,
}: {
  words: readonly FieldWord[] | undefined;
  onChange: (words: FieldWord[]) => void;
}) {
  const entries = words ?? [];
  return (
    <div className="field-option field-words">
      <span className="inline-label">words</span>
      {entries.map((word, index) => (
        <div key={index} className="effect-fields">
          <InlineField label="below">
            <OptionalNumberInput
              value={word.below}
              placeholder="always"
              onChange={(below) => onChange(changeFieldWord(entries, index, { below }))}
            />
          </InlineField>
          <TextInput
            value={word.text}
            onChange={(text) => onChange(changeFieldWord(entries, index, { text }))}
          />
          <button
            className="icon-button"
            title="Move up"
            disabled={index === 0}
            onClick={() => onChange(moveFieldWord(entries, index, -1))}
          >
            ↑
          </button>
          <button
            className="icon-button"
            title="Move down"
            disabled={index === entries.length - 1}
            onClick={() => onChange(moveFieldWord(entries, index, 1))}
          >
            ↓
          </button>
          <button
            className="icon-button"
            title="Remove entry"
            onClick={() => onChange(removeFieldWord(entries, index))}
          >
            ×
          </button>
        </div>
      ))}
      <button className="add-button" onClick={() => onChange(addFieldWord(words))}>
        + words
      </button>
      <p className="field-hint">
        The first entry the value is under wins; {"{value}"} is the value rounded down.
      </p>
    </div>
  );
}

export function NumberOptions({
  declaration,
  fieldName,
  onBound,
  onWords,
}: {
  declaration: ComponentDeclaration;
  fieldName: string;
  onBound: (bound: "min" | "max", value: FieldBound | undefined) => void;
  onWords: (words: FieldWord[]) => void;
}) {
  const field = declaration.fields[fieldName];
  if (!field) return null;
  const siblings = listSiblingNumberFields(declaration, fieldName);
  return (
    <>
      <div className="field-option">
        <BoundOption
          label="min"
          bound={field.min}
          siblings={siblings}
          onChange={(value) => onBound("min", value)}
        />
        <BoundOption
          label="max"
          bound={field.max}
          siblings={siblings}
          onChange={(value) => onBound("max", value)}
        />
      </div>
      <WordsOption words={field.words} onChange={onWords} />
    </>
  );
}
