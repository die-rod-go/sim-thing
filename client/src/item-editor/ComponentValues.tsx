import type { FieldValue, ItemDefinition, ItemFile, ItemProblem } from "@village/shared";
import { FieldValueInput, formatFieldValue } from "./ComponentFieldInput";
import {
  addComponentToDefinition,
  buildDefaultFieldValue,
  clearComponentField,
  removeComponentFromDefinition,
  setComponentField,
} from "./definition-edits";
import { selectProblemsUnder } from "./problems";
import { InlineField, ItemProblemList } from "./widgets";

/** The components an item has: each with its fields, problems and a way to remove it. */
export function ComponentValues({
  definition,
  file,
  problems,
  entryPath,
  onChange,
}: {
  definition: ItemDefinition;
  file: ItemFile;
  problems: readonly ItemProblem[];
  entryPath: string;
  onChange: (definition: ItemDefinition) => void;
}) {
  const missing = Object.keys(file.components).filter(
    (name) => !Object.hasOwn(definition.components, name),
  );
  const definitionIds = file.definitions.map((entry) => entry.id);
  return (
    <div className="row-list">
      {Object.entries(definition.components).map(([componentName, values]) => {
        const declaration = file.components[componentName];
        return (
          <div key={componentName} className="component-block">
            <div className="component-heading">
              <strong className="component-name">{componentName}</strong>
              {declaration === undefined ? (
                <span className="field-hint">no longer declared</span>
              ) : (
                declaration.description !== "" && (
                  <span className="field-hint">{declaration.description}</span>
                )
              )}
              <button
                className="icon-button"
                title={`Remove ${componentName}`}
                onClick={() => onChange(removeComponentFromDefinition(definition, componentName))}
              >
                ×
              </button>
            </div>
            <div className="effect-fields">
              {Object.entries(declaration?.fields ?? {}).map(([fieldName, field]) => {
                const value = values[fieldName];
                const change = (next: FieldValue) =>
                  onChange(setComponentField(definition, componentName, fieldName, next));
                const fieldDefault = field.default;
                return (
                  <InlineField key={fieldName} label={fieldName}>
                    {value === undefined && fieldDefault !== undefined ? (
                      <>
                        <span className="muted">default ({formatFieldValue(fieldDefault)})</span>
                        <button className="add-button" onClick={() => change(fieldDefault)}>
                          override
                        </button>
                      </>
                    ) : (
                      <>
                        <FieldValueInput
                          field={field}
                          value={value ?? buildDefaultFieldValue(field.type)}
                          definitionIds={definitionIds}
                          onChange={change}
                        />
                        {fieldDefault !== undefined && (
                          <button
                            className="add-button"
                            onClick={() =>
                              onChange(clearComponentField(definition, componentName, fieldName))
                            }
                          >
                            use default
                          </button>
                        )}
                      </>
                    )}
                  </InlineField>
                );
              })}
            </div>
            <ItemProblemList
              problems={selectProblemsUnder(problems, `${entryPath}.components.${componentName}`)}
            />
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
