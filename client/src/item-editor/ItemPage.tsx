import { ITEM_FORMS, type ItemDefinition, type ItemFile, type ItemProblem } from "@village/shared";
import { CommittedTextInput, TextInput } from "../characters/fields";
import { ComponentValues } from "./ComponentValues";
import { updateDefinition } from "./definition-edits";
import { EffectList } from "./EffectList";
import { describeItemPreview } from "./item-preview";
import { ItemVerbs } from "./ItemVerbs";
import { selectEntryProblems } from "./problems";
import { GlyphPicker } from "./GlyphPicker";
import { NO_READABLE_PATHS, OptionalValue } from "./value-inputs";
import { Checkbox, Chips, Choice, InlineField, ItemProblemList } from "./widgets";

/** One item definition: what it is, its components, the verbs it offers and how prompts show it. */
export function ItemPage({
  file,
  definitionIndex,
  problems,
  stimuli,
  onEdit,
}: {
  file: ItemFile;
  definitionIndex: number;
  problems: readonly ItemProblem[];
  stimuli: readonly string[];
  onEdit: (file: ItemFile) => void;
}) {
  const definition = file.definitions[definitionIndex];
  if (!definition) return null;
  const update = (changes: Partial<ItemDefinition>) =>
    onEdit(updateDefinition(file, definitionIndex, { ...definition, ...changes }));
  const ownProblems = selectEntryProblems(problems, file, "definitions", definitionIndex);

  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="id">
            <CommittedTextInput value={definition.id} onCommit={(id) => update({ id })} />
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
          <InlineField label="form">
            <Choice
              value={definition.form}
              choices={ITEM_FORMS}
              onChange={(form) => update({ form })}
            />
          </InlineField>
        </div>
        <div className="effect-fields">
          <GlyphPicker glyph={definition.glyph} onChange={(glyph) => update({ glyph })} />
        </div>
        <div className="effect-fields">
          <Checkbox
            label="visible when carried"
            checked={definition.isVisibleWhenCarried}
            onChange={(isVisibleWhenCarried) => update({ isVisibleWhenCarried })}
          />
        </div>
        <div className="effect-fields">
          <InlineField label="properties">
            <Chips
              values={definition.properties}
              options={Object.keys(file.properties)}
              onChange={(properties) => update({ properties })}
            />
          </InlineField>
        </div>
      </section>
      <section className="form-section">
        <h3>Components</h3>
        <ComponentValues
          definition={definition}
          file={file}
          onChange={(changed) => onEdit(updateDefinition(file, definitionIndex, changed))}
        />
        <h4>When it breaks</h4>
        <OptionalValue
          label="onBroken"
          isSet={definition.onBroken !== undefined}
          onToggle={(isSet) => update({ onBroken: isSet ? [] : undefined })}
        >
          <EffectList
            effects={definition.onBroken ?? []}
            onChange={(onBroken) => update({ onBroken })}
            file={file}
            owner="on_broken"
            stimuli={stimuli}
            paths={NO_READABLE_PATHS}
          />
        </OptionalValue>
        <p className="field-hint">Off: it is destroyed when its durability runs out.</p>
      </section>
      <section className="form-section">
        <h3>Verbs that apply to it</h3>
        <ItemVerbs
          key={definitionIndex}
          definition={definition}
          file={file}
          stimuli={stimuli}
          problems={problems}
          onEdit={onEdit}
        />
      </section>
      <section className="form-section">
        <h3>How agents see it</h3>
        <p className="item-preview">“{describeItemPreview(file, definition)}”</p>
      </section>
      <ItemProblemList problems={ownProblems} />
    </div>
  );
}
