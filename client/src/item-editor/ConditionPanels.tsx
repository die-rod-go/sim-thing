import type { ConditionDefinition, ItemFile, ItemProblem, Reaction } from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { updateCondition, updateReaction } from "./condition-edits";
import { EffectList } from "./EffectList";
import { selectEntryProblems } from "./problems";
import { listConditionUses } from "./usage";
import { NO_READABLE_PATHS, OptionalValue } from "./value-inputs";
import { PhrasesEditor } from "./verb-parts";
import { Checkbox, Choice, InlineField, ItemProblemList, SuggestingInput } from "./widgets";

const KILLED_PHRASE_KEYS = ["killed"] as const;
const NOTHING = "";

interface PanelProps {
  file: ItemFile;
  index: number;
  problems: readonly ItemProblem[];
  stimuli: readonly string[];
  onEdit: (file: ItemFile) => void;
}

export function ConditionPanel({ file, index, problems, stimuli, onEdit }: PanelProps) {
  const condition = file.conditions[index];
  if (!condition) return null;
  const update = (changes: Partial<ConditionDefinition>) =>
    onEdit(updateCondition(file, index, { ...condition, ...changes }));
  const effectProps = { file, owner: "condition" as const, stimuli, paths: NO_READABLE_PATHS };
  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="name">
            <TextInput value={condition.name} onChange={(name) => update({ name })} />
          </InlineField>
          <InlineField label="words">
            <TextInput value={condition.words} onChange={(words) => update({ words })} />
          </InlineField>
          <Checkbox
            label="visible to others"
            checked={condition.isVisible}
            onChange={(isVisible) => update({ isVisible })}
          />
          <InlineField label="lasts (minutes)">
            <OptionalValue
              label="default minutes"
              isSet={condition.defaultMinutes !== null}
              onToggle={(isSet) => update({ defaultMinutes: isSet ? 1 : null })}
            >
              <NumberInput
                value={condition.defaultMinutes ?? 1}
                min={0}
                onChange={(defaultMinutes) => update({ defaultMinutes })}
              />
            </OptionalValue>
          </InlineField>
        </div>
        <p className="field-hint">
          Off: lasts until something removes it. Used by:{" "}
          {listConditionUses(file, condition.name).join(", ") || "nothing yet"}
        </p>
      </section>
      <section className="form-section">
        <h4>Every minute</h4>
        <EffectList
          effects={condition.everyMinute}
          onChange={(everyMinute) => update({ everyMinute })}
          {...effectProps}
        />
        <h4>When it ends</h4>
        <EffectList
          effects={condition.onEnd}
          onChange={(onEnd) => update({ onEnd })}
          {...effectProps}
        />
        <PhrasesEditor
          phrases={condition.phrases}
          keys={KILLED_PHRASE_KEYS}
          onChange={(phrases) => update({ phrases })}
        />
      </section>
      <ItemProblemList problems={selectEntryProblems(problems, file, "conditions", index)} />
    </div>
  );
}

function OptionalNameChoice({
  value,
  choices,
  onChange,
}: {
  value: string | undefined;
  choices: readonly string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Choice
      value={value ?? NOTHING}
      choices={[NOTHING, ...choices]}
      labels={{ [NOTHING]: "—" }}
      onChange={(chosen) => onChange(chosen === NOTHING ? undefined : chosen)}
    />
  );
}

export function ReactionPanel({ file, index, problems, stimuli, onEdit }: PanelProps) {
  const reaction = file.reactions[index];
  if (!reaction) return null;
  const update = (changes: Partial<Reaction>) =>
    onEdit(updateReaction(file, index, { ...reaction, ...changes }));
  const properties = Object.keys(file.properties);
  const conditions = file.conditions.map((condition) => condition.name);
  return (
    <div className="character-form">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="stimulus">
            <SuggestingInput
              value={reaction.stimulus}
              suggestions={stimuli}
              onChange={(stimulus) => update({ stimulus })}
            />
          </InlineField>
          <InlineField label="property">
            <OptionalNameChoice
              value={reaction.property}
              choices={properties}
              onChange={(property) => update({ property })}
            />
          </InlineField>
          <InlineField label="condition">
            <OptionalNameChoice
              value={reaction.condition}
              choices={conditions}
              onChange={(condition) => update({ condition })}
            />
          </InlineField>
          <InlineField label="unless">
            <OptionalNameChoice
              value={reaction.unless}
              choices={[...properties, ...conditions]}
              onChange={(unless) => update({ unless })}
            />
          </InlineField>
        </div>
        <p className="field-hint">Runs on anything with the property, the condition, or both.</p>
      </section>
      <section className="form-section">
        <h4>Effects</h4>
        <EffectList
          effects={reaction.effects}
          onChange={(effects) => update({ effects })}
          file={file}
          owner="reaction"
          stimuli={stimuli}
          paths={NO_READABLE_PATHS}
        />
        <PhrasesEditor
          phrases={reaction.phrases}
          keys={KILLED_PHRASE_KEYS}
          onChange={(phrases) => update({ phrases })}
        />
      </section>
      <ItemProblemList problems={selectEntryProblems(problems, file, "reactions", index)} />
    </div>
  );
}
