import type { FieldType, FieldValue, ItemDefinition, ItemFile } from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  addComponentToDefinition,
  buildDefaultFieldValue,
  removeComponentFromDefinition,
  setComponentField,
} from "./definition-edits";
import { Checkbox, InlineField } from "./widgets";

const { numberStep } = clientConfig.itemEditor;

/** An input that fits the field's declared type; a value of the wrong type starts over. */
function FieldValueInput({
  type,
  value,
  onChange,
}: {
  type: FieldType;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}) {
  if (type === "number") {
    return (
      <NumberInput
        value={typeof value === "number" ? value : 0}
        step={numberStep}
        onChange={onChange}
      />
    );
  }
  if (type === "boolean") {
    return <Checkbox label="" checked={value === true} onChange={onChange} />;
  }
  if (type === "text") {
    return <TextInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
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

/** The components an item has, each field with an input of its declared type. */
export function ComponentValues({
  definition,
  file,
  onChange,
}: {
  definition: ItemDefinition;
  file: ItemFile;
  onChange: (definition: ItemDefinition) => void;
}) {
  const missing = Object.keys(file.components).filter(
    (name) => !Object.hasOwn(definition.components, name),
  );
  return (
    <div className="row-list">
      {Object.entries(definition.components).map(([componentName, values]) => {
        const fields = Object.entries(file.components[componentName]?.fields ?? {});
        return (
          <div key={componentName} className="effect-fields">
            <strong className="component-name">{componentName}</strong>
            {fields.map(([fieldName, field]) => (
              <InlineField key={fieldName} label={fieldName}>
                <FieldValueInput
                  type={field.type}
                  value={values[fieldName] ?? buildDefaultFieldValue(field.type)}
                  onChange={(value) =>
                    onChange(setComponentField(definition, componentName, fieldName, value))
                  }
                />
              </InlineField>
            ))}
            <button
              className="icon-button"
              title={`Remove ${componentName}`}
              onClick={() => onChange(removeComponentFromDefinition(definition, componentName))}
            >
              ×
            </button>
          </div>
        );
      })}
      {missing.length > 0 && (
        <select
          className="editor-input add-select"
          value=""
          onChange={(event) =>
            onChange(addComponentToDefinition(file, definition, event.target.value))
          }
        >
          <option value="">+ component</option>
          {missing.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
