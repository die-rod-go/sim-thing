import { FIELD_TYPES, type ItemFile, type ItemProblem } from "@village/shared";
import { CommittedTextInput, TextInput } from "../characters/fields";
import {
  addComponentField,
  removeComponentField,
  renameComponentDeclaration,
  renameComponentField,
  setComponentFieldType,
  updateComponentDeclaration,
} from "./declaration-edits";
import { selectProblemsUnder } from "./problems";
import { listComponentUses } from "./usage";
import { Checkbox, Choice, InlineField, ItemProblemList } from "./widgets";

function UsageList({ uses }: { uses: readonly string[] }) {
  return (
    <p className="field-hint">Used by: {uses.length === 0 ? "nothing yet" : uses.join(", ")}</p>
  );
}

/** A component's description, prompt words and fields. Field options are edited in the file. */
export function ComponentPanel({
  file,
  name,
  problems,
  onEdit,
}: {
  file: ItemFile;
  name: string;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  const declaration = file.components[name];
  if (!declaration) return null;
  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="name">
            <CommittedTextInput
              value={name}
              onCommit={(newName) => onEdit(renameComponentDeclaration(file, name, newName))}
            />
          </InlineField>
          <InlineField label="description">
            <TextInput
              value={declaration.description}
              onChange={(description) =>
                onEdit(updateComponentDeclaration(file, name, { ...declaration, description }))
              }
            />
          </InlineField>
        </div>
        <div className="effect-fields">
          <InlineField label="words">
            <TextInput
              value={declaration.words ?? ""}
              placeholder="never mentioned"
              onChange={(words) =>
                onEdit(
                  updateComponentDeclaration(file, name, {
                    ...declaration,
                    words: words === "" ? undefined : words,
                  }),
                )
              }
            />
          </InlineField>
          <Checkbox
            label="visible to others"
            checked={declaration.isVisible}
            onChange={(isVisible) =>
              onEdit(updateComponentDeclaration(file, name, { ...declaration, isVisible }))
            }
          />
        </div>
        <UsageList uses={listComponentUses(file, name)} />
      </section>
      <section className="form-section">
        <h3>Fields</h3>
        <div className="row-list">
          {Object.entries(declaration.fields).map(([fieldName, field]) => (
            <div key={fieldName} className="effect-fields">
              <CommittedTextInput
                value={fieldName}
                onCommit={(newField) =>
                  onEdit(renameComponentField(file, name, fieldName, newField))
                }
              />
              <Choice
                value={field.type}
                choices={FIELD_TYPES}
                onChange={(type) => onEdit(setComponentFieldType(file, name, fieldName, type))}
              />
              <TextInput
                value={field.description}
                placeholder="description"
                onChange={(description) =>
                  onEdit(
                    updateComponentDeclaration(file, name, {
                      ...declaration,
                      fields: { ...declaration.fields, [fieldName]: { ...field, description } },
                    }),
                  )
                }
              />
              <button
                className="icon-button"
                title={`Remove ${fieldName}`}
                onClick={() => onEdit(removeComponentField(file, name, fieldName))}
              >
                ×
              </button>
            </div>
          ))}
          <button className="add-button" onClick={() => onEdit(addComponentField(file, name))}>
            + field
          </button>
        </div>
      </section>
      <ItemProblemList problems={selectProblemsUnder(problems, `components.${name}`)} />
    </div>
  );
}
