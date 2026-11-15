import { FIELD_TYPES, type ItemFile, type ItemProblem } from "@village/shared";
import { TextInput } from "../characters/fields";
import {
  addComponentField,
  removeComponentField,
  setComponentFieldType,
  setFieldBound,
  setFieldDefault,
  setFieldDescription,
  setFieldWords,
  updateComponentDeclaration,
} from "./component-edits";
import type { TabSelection } from "./editor-state";
import { DefaultOption, NumberOptions } from "./FieldOptions";
import { selectProblemsUnder } from "./problems";
import { renameComponentEverywhere, renameFieldEverywhere } from "./rename-edits";
import { listComponentUses, type ComponentUse } from "./usage";
import { Checkbox, Choice, InlineField, ItemProblemList, RenameInput } from "./widgets";

const USE_GROUPS = [
  { kind: "item", tab: "items", title: "Items" },
  { kind: "verb", tab: "verbs", title: "Verbs" },
  { kind: "rule", tab: "rules", title: "Rules" },
] as const;

function UsedBy({
  uses,
  onOpen,
}: {
  uses: readonly ComponentUse[];
  onOpen: (selection: TabSelection) => void;
}) {
  return (
    <section className="form-section component-uses">
      <h3>Used by</h3>
      {USE_GROUPS.map((group) => {
        const groupUses = uses.filter((use) => use.kind === group.kind);
        return (
          <div key={group.kind} className="use-group">
            <span className="inline-label">{group.title}</span>
            {groupUses.length === 0 && <span className="muted">nothing yet</span>}
            {groupUses.map((use) => (
              <button
                key={use.index}
                className="use-link"
                onClick={() => onOpen({ tab: group.tab, index: use.index })}
              >
                {use.label}
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}

interface PageProps {
  file: ItemFile;
  name: string;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}

function FieldRow({ file, name, fieldName, problems, onEdit }: PageProps & { fieldName: string }) {
  const declaration = file.components[name];
  const field = declaration?.fields[fieldName];
  if (!declaration || !field) return null;
  const definitionIds = file.definitions.map((definition) => definition.id);
  return (
    <div className="component-field">
      <div className="effect-fields">
        <RenameInput
          value={fieldName}
          isTaken={(newField) => Object.hasOwn(declaration.fields, newField)}
          onRename={(newField) => onEdit(renameFieldEverywhere(file, name, fieldName, newField))}
        />
        <Choice
          value={field.type}
          choices={FIELD_TYPES}
          onChange={(type) => onEdit(setComponentFieldType(file, name, fieldName, type))}
        />
        <TextInput
          value={field.description}
          placeholder="description"
          onChange={(text) => onEdit(setFieldDescription(file, name, fieldName, text))}
        />
        <button
          className="icon-button"
          title={`Remove ${fieldName}`}
          onClick={() => onEdit(removeComponentField(file, name, fieldName))}
        >
          ×
        </button>
      </div>
      <DefaultOption
        field={field}
        definitionIds={definitionIds}
        onChange={(value) => onEdit(setFieldDefault(file, name, fieldName, value))}
      />
      {field.type === "number" && (
        <NumberOptions
          declaration={declaration}
          fieldName={fieldName}
          onBound={(bound, value) => onEdit(setFieldBound(file, name, fieldName, bound, value))}
          onWords={(words) => onEdit(setFieldWords(file, name, fieldName, words))}
        />
      )}
      <ItemProblemList problems={problems} />
    </div>
  );
}

/** One component: its description, prompt words, fields with their options, and what uses it. */
export function ComponentPage({
  file,
  name,
  problems,
  onEdit,
  onOpen,
}: PageProps & { onOpen: (selection: TabSelection) => void }) {
  const declaration = file.components[name];
  if (!declaration) return null;
  const prefix = `components.${name}`;
  const fieldPaths = new Set(Object.keys(declaration.fields).map((field) => `${prefix}.${field}`));
  const pageProblems = selectProblemsUnder(problems, prefix).filter(
    (problem) => !fieldPaths.has(problem.path),
  );
  return (
    <div className="character-form component-page">
      <section className="form-section">
        <ItemProblemList problems={pageProblems} />
        <div className="effect-fields">
          <InlineField label="name">
            <RenameInput
              value={name}
              isTaken={(newName) => Object.hasOwn(file.components, newName)}
              onRename={(newName) => onEdit(renameComponentEverywhere(file, name, newName))}
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
      </section>
      <section className="form-section">
        <h3>Fields</h3>
        <div className="row-list">
          {Object.keys(declaration.fields).map((fieldName) => (
            <FieldRow
              key={fieldName}
              file={file}
              name={name}
              fieldName={fieldName}
              problems={problems.filter((problem) => problem.path === `${prefix}.${fieldName}`)}
              onEdit={onEdit}
            />
          ))}
          <button className="add-button" onClick={() => onEdit(addComponentField(file, name))}>
            + field
          </button>
        </div>
      </section>
      <UsedBy uses={listComponentUses(file, name)} onOpen={onOpen} />
    </div>
  );
}
