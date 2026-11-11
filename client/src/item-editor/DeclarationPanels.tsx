import { FIELD_TYPES, isEngineComponent, type ItemFile, type ItemProblem } from "@village/shared";
import { CommittedTextInput, TextInput } from "../characters/fields";
import {
  addComponentField,
  removeComponentField,
  renameComponentDeclaration,
  renameComponentField,
  renamePropertyDeclaration,
  setComponentFieldType,
  updateComponentDeclaration,
  updatePropertyDeclaration,
} from "./declaration-edits";
import { selectProblemsUnder } from "./problems";
import { listComponentUses, listPropertyUses } from "./usage";
import { Checkbox, Choice, InlineField, ItemProblemList } from "./widgets";

function UsageList({ uses }: { uses: readonly string[] }) {
  return (
    <p className="field-hint">Used by: {uses.length === 0 ? "nothing yet" : uses.join(", ")}</p>
  );
}

/** A component's description and fields. The engine reads some components; their fields lock. */
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
  const isLocked = isEngineComponent(name);
  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="name">
            {isLocked ? (
              <strong>{name}</strong>
            ) : (
              <CommittedTextInput
                value={name}
                onCommit={(newName) => onEdit(renameComponentDeclaration(file, name, newName))}
              />
            )}
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
        {isLocked && (
          <p className="field-hint">The engine reads this component, so its fields are fixed.</p>
        )}
        <UsageList uses={listComponentUses(file, name)} />
      </section>
      <section className="form-section">
        <h3>Fields</h3>
        <div className="row-list">
          {Object.entries(declaration.fields).map(([fieldName, field]) => (
            <div key={fieldName} className="effect-fields">
              {isLocked ? (
                <strong>
                  {fieldName}: {field.type}
                </strong>
              ) : (
                <>
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
                </>
              )}
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
              {!isLocked && (
                <button
                  className="icon-button"
                  title={`Remove ${fieldName}`}
                  onClick={() => onEdit(removeComponentField(file, name, fieldName))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {!isLocked && (
            <button className="add-button" onClick={() => onEdit(addComponentField(file, name))}>
              + field
            </button>
          )}
        </div>
      </section>
      <ItemProblemList problems={selectProblemsUnder(problems, `components.${name}`)} />
    </div>
  );
}

/** A property's description and prompt word, where it is used, and whether people have it. */
export function PropertyPanel({
  file,
  name,
  onEdit,
}: {
  file: ItemFile;
  name: string;
  onEdit: (file: ItemFile) => void;
}) {
  const declaration = file.properties[name];
  if (!declaration) return null;
  const update = (changes: Partial<typeof declaration>) =>
    onEdit(updatePropertyDeclaration(file, name, { ...declaration, ...changes }));
  const isOnPeople = file.person.properties.includes(name);
  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="name">
            <CommittedTextInput
              value={name}
              onCommit={(newName) => onEdit(renamePropertyDeclaration(file, name, newName))}
            />
          </InlineField>
          <InlineField label="description">
            <TextInput
              value={declaration.description}
              onChange={(description) => update({ description })}
            />
          </InlineField>
        </div>
        <div className="effect-fields">
          <Checkbox
            label="shown in prompts"
            checked={declaration.isVisible}
            onChange={(isVisible) => update({ isVisible })}
          />
          <InlineField label="word">
            <TextInput
              value={declaration.word ?? ""}
              placeholder={name}
              onChange={(word) => update({ word: word === "" ? undefined : word })}
            />
          </InlineField>
          <Checkbox
            label="people have it"
            checked={isOnPeople}
            onChange={(isChecked) =>
              onEdit({
                ...file,
                person: {
                  properties: isChecked
                    ? [...file.person.properties, name]
                    : file.person.properties.filter((property) => property !== name),
                },
              })
            }
          />
        </div>
        <UsageList uses={listPropertyUses(file, name)} />
      </section>
    </div>
  );
}
