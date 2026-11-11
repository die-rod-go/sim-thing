import { useMemo } from "react";
import type { ItemFile, ItemProblem, Verb } from "@village/shared";
import { TextInput } from "../characters/fields";
import { RuleBuilder } from "./RuleBuilder";
import { StepsEditor } from "./StepsEditor";
import { NumberValueInput, type ReadablePaths } from "./value-inputs";
import { PHRASE_KEYS, PhrasesEditor, TakesEditor } from "./verb-parts";
import { listReadablePaths } from "./verb-edits";
import { Checkbox, InlineField, ItemProblemList } from "./widgets";

export function useReadablePaths(file: ItemFile, verb: Verb): ReadablePaths {
  return useMemo(
    () => ({
      number: listReadablePaths(file, verb.appliesTo, "number"),
      range: listReadablePaths(file, verb.appliesTo, "range"),
    }),
    [file, verb.appliesTo],
  );
}

/** Every field of one verb: what it applies to and targets, reach, takes, steps and phrases. */
export function VerbEditor({
  verb,
  file,
  problems,
  onChange,
}: {
  verb: Verb;
  file: ItemFile;
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
          <TakesEditor takes={verb.takes} onChange={(takes) => update({ takes })} />
          <Checkbox
            label="done in passing"
            checked={verb.isDoneInPassing}
            onChange={(isDoneInPassing) => update({ isDoneInPassing })}
          />
          <InlineField label="reach">
            <NumberValueInput
              value={verb.reach}
              paths={paths}
              onChange={(reach) => update({ reach })}
            />
          </InlineField>
        </div>
        <h4>Applies to (the item)</h4>
        <RuleBuilder
          matcher={verb.appliesTo}
          file={file}
          emptyLabel="bare-handed (no appliesTo)"
          onChange={(appliesTo) => update({ appliesTo })}
        />
        <h4>Target</h4>
        <RuleBuilder
          matcher={verb.target}
          file={file}
          emptyLabel="no target"
          onChange={(target) => update({ target })}
        />
      </section>
      <section className="form-section">
        <h4>Steps (JSON, run in order)</h4>
        <StepsEditor steps={verb.steps} onChange={(steps) => update({ steps })} />
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
