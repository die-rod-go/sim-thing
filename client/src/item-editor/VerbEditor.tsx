import { useMemo } from "react";
import { VERB_TARGETS, type ItemFile, type ItemProblem, type Verb } from "@village/shared";
import { TextInput } from "../characters/fields";
import { EffectList } from "./EffectList";
import { RuleBuilder } from "./RuleBuilder";
import { NumberValueInput, OptionalValue, type ReadablePaths } from "./value-inputs";
import { InputsEditor, PHRASE_KEYS, PhrasesEditor, ToolsEditor } from "./verb-parts";
import { listReadablePaths } from "./verb-edits";
import { Checkbox, Choice, InlineField, ItemProblemList } from "./widgets";

export function useReadablePaths(file: ItemFile, verb: Verb): ReadablePaths {
  return useMemo(
    () => ({
      number: listReadablePaths(file, verb.appliesTo, "number"),
      range: listReadablePaths(file, verb.appliesTo, "range"),
      text: listReadablePaths(file, verb.appliesTo, "text"),
    }),
    [file, verb.appliesTo],
  );
}

/** Every field of one verb: its rule, numbers, inputs and tools, effects and phrases. */
export function VerbEditor({
  verb,
  file,
  stimuli,
  problems,
  onChange,
}: {
  verb: Verb;
  file: ItemFile;
  stimuli: readonly string[];
  problems: readonly ItemProblem[];
  onChange: (verb: Verb) => void;
}) {
  const paths = useReadablePaths(file, verb);
  const update = (changes: Partial<Verb>) => onChange({ ...verb, ...changes });
  return (
    <div className="verb-editor">
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="name">
            <TextInput value={verb.name} onChange={(name) => update({ name })} />
          </InlineField>
          <InlineField label="target">
            <Choice
              value={verb.target}
              choices={VERB_TARGETS}
              onChange={(target) => update({ target })}
            />
          </InlineField>
          <Checkbox
            label="can target self"
            checked={verb.canTargetSelf}
            onChange={(canTargetSelf) => update({ canTargetSelf })}
          />
          <Checkbox
            label="takes text"
            checked={verb.takesText}
            onChange={(takesText) => update({ takesText })}
          />
          <Checkbox
            label="done in passing"
            checked={verb.isDoneInPassing}
            onChange={(isDoneInPassing) => update({ isDoneInPassing })}
          />
        </div>
        <h4>Applies to</h4>
        <RuleBuilder
          matcher={verb.appliesTo}
          file={file}
          onChange={(appliesTo) => update({ appliesTo })}
        />
      </section>
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="reach">
            <NumberValueInput
              value={verb.reach}
              paths={paths}
              onChange={(reach) => update({ reach })}
            />
          </InlineField>
          <InlineField label="minutes">
            <OptionalValue
              label="minutes"
              isSet={verb.minutes !== null}
              onToggle={(isSet) => update({ minutes: isSet ? 1 : null })}
            >
              {verb.minutes !== null && (
                <NumberValueInput
                  value={verb.minutes}
                  paths={paths}
                  onChange={(minutes) => update({ minutes })}
                />
              )}
            </OptionalValue>
          </InlineField>
          <InlineField label="loud">
            <OptionalValue
              label="loudness"
              isSet={verb.loudness !== null}
              onToggle={(isSet) => update({ loudness: isSet ? 1 : null })}
            >
              {verb.loudness !== null && (
                <NumberValueInput
                  value={verb.loudness}
                  paths={paths}
                  onChange={(loudness) => update({ loudness })}
                />
              )}
            </OptionalValue>
          </InlineField>
          <InlineField label="hit roll">
            <OptionalValue
              label="hit roll"
              isSet={verb.hitRoll !== undefined}
              onToggle={(isSet) => update({ hitRoll: isSet ? { baseHitChance: 1 } : undefined })}
            >
              {verb.hitRoll && (
                <NumberValueInput
                  value={verb.hitRoll.baseHitChance}
                  paths={paths}
                  onChange={(baseHitChance) => update({ hitRoll: { baseHitChance } })}
                />
              )}
            </OptionalValue>
          </InlineField>
        </div>
        <p className="field-hint">
          Minutes off: it ends by its own rules (like sleep). Loud off: silent.
        </p>
        <div className="effect-fields">
          <InlineField label="uses up">
            <InputsEditor
              inputs={verb.inputs}
              file={file}
              onChange={(inputs) => update({ inputs })}
            />
          </InlineField>
        </div>
        <div className="effect-fields">
          <span className="inline-label">tools</span>
          <ToolsEditor tools={verb.tools} file={file} onChange={(tools) => update({ tools })} />
        </div>
      </section>
      <section className="form-section">
        <h4>Effects (drag or use the arrows to reorder)</h4>
        <EffectList
          effects={verb.effects}
          onChange={(effects) => update({ effects })}
          file={file}
          owner="verb"
          stimuli={stimuli}
          paths={paths}
        />
      </section>
      <section className="form-section">
        <h4>Phrases</h4>
        <PhrasesEditor
          phrases={verb.phrases}
          keys={PHRASE_KEYS}
          onChange={(phrases) => update({ phrases })}
        />
      </section>
      <ItemProblemList problems={problems} />
    </div>
  );
}
