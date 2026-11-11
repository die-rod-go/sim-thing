import type { ConditionDefinition, ItemFile, ItemProblem, Reaction } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { updateCondition, updateReaction } from "./condition-edits";
import { EffectList } from "./EffectList";
import { MatcherInput } from "./MatcherInput";
import { selectEntryProblems } from "./problems";
import { listConditionUses } from "./usage";
import { NO_READABLE_PATHS, OptionalValue } from "./value-inputs";
import { PhrasesEditor } from "./verb-parts";
import { Choice, InlineField, ItemProblemList, SuggestingInput } from "./widgets";

const KILLED_PHRASE_KEYS = ["killed"] as const;
const CONDITION_PHRASE_KEYS = ["started", "ended", "killed"] as const;

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
          <InlineField label="component">
            <Choice
              value={condition.name}
              choices={Object.keys(file.components)}
              onChange={(name) => update({ name })}
            />
          </InlineField>
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
          Off: lasts until something removes it. Words and visibility are set on the component. Used
          by: {listConditionUses(file, condition.name).join(", ") || "nothing yet"}
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
          keys={CONDITION_PHRASE_KEYS}
          onChange={(phrases) => update({ phrases })}
        />
      </section>
      <ItemProblemList problems={selectEntryProblems(problems, file, "conditions", index)} />
    </div>
  );
}

export function ReactionPanel({ file, index, problems, stimuli, onEdit }: PanelProps) {
  const reaction = file.reactions[index];
  if (!reaction) return null;
  const update = (changes: Partial<Reaction>) =>
    onEdit(updateReaction(file, index, { ...reaction, ...changes }));
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
          <InlineField label="if">
            <MatcherInput matcher={reaction.if} onChange={(matched) => update({ if: matched })} />
          </InlineField>
        </div>
        <p className="field-hint">
          Runs on anything the matcher accepts: has, definition, field, anyOf, allOf, not (JSON).
        </p>
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
