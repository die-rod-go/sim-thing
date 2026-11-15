import { type ItemDefinition, type ItemFile, type ItemProblem } from "@village/shared";
import { TextInput } from "../characters/fields";
import { ComponentValues } from "./ComponentValues";
import { updateDefinition } from "./definition-edits";
import type { TabSelection } from "./editor-state";
import { GlyphPicker } from "./GlyphPicker";
import { describeItemPreview } from "./item-preview";
import { ItemVerbs } from "./ItemVerbs";
import { formatEntryPath, selectEntryProblems } from "./problems";
import { renameDefinitionEverywhere } from "./rename-edits";
import { InlineField, ItemProblemList, RenameInput } from "./widgets";

/** One item definition: what it is, its components, the verbs it offers and how prompts show it. */
export function ItemPage({
  file,
  definitionIndex,
  problems,
  onEdit,
  onOpen,
}: {
  file: ItemFile;
  definitionIndex: number;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile, selection?: TabSelection) => void;
  onOpen: (selection: TabSelection) => void;
}) {
  const definition = file.definitions[definitionIndex];
  if (!definition) return null;
  const update = (changes: Partial<ItemDefinition>) =>
    onEdit(updateDefinition(file, definitionIndex, { ...definition, ...changes }));
  const entryPath = formatEntryPath(file, "definitions", definitionIndex);
  const componentsPath = `${entryPath}.components`;
  const ownProblems = selectEntryProblems(problems, file, "definitions", definitionIndex).filter(
    (problem) => !problem.path.startsWith(`${componentsPath}.`) && problem.path !== componentsPath,
  );

  return (
    <div className="character-form">
      <ItemProblemList problems={ownProblems} />
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="id">
            <RenameInput
              value={definition.id}
              isTaken={(id) => file.definitions.some((other) => other.id === id)}
              onRename={(id) => onEdit(renameDefinitionEverywhere(file, definition.id, id))}
            />
          </InlineField>
          <InlineField label="name">
            <TextInput value={definition.name} onChange={(name) => update({ name })} />
          </InlineField>
          <InlineField label="plural">
            <TextInput
              value={definition.plural ?? ""}
              placeholder="counted without one"
              onChange={(plural) => update({ plural: plural === "" ? undefined : plural })}
            />
          </InlineField>
        </div>
        <div className="effect-fields">
          <GlyphPicker glyph={definition.glyph} onChange={(glyph) => update({ glyph })} />
        </div>
      </section>
      <section className="form-section">
        <h3>Components</h3>
        <ComponentValues
          definition={definition}
          file={file}
          problems={problems}
          entryPath={entryPath}
          onChange={(changed) => onEdit(updateDefinition(file, definitionIndex, changed))}
        />
      </section>
      <section className="form-section">
        <h3>Verbs that apply</h3>
        <ItemVerbs
          definition={definition}
          file={file}
          problems={problems}
          onEdit={onEdit}
          onOpen={onOpen}
        />
      </section>
      <section className="form-section">
        <h3>How agents see it</h3>
        <p className="item-preview">“{describeItemPreview(file, definition)}”</p>
      </section>
    </div>
  );
}
