import type { ItemFile, ItemProblem, Verb } from "@village/shared";
import { TextInput } from "../characters/fields";
import { OptionalMatcherBuilder } from "./MatcherBuilder";
import { StepList } from "./StepList";
import { NumberValueInput } from "./ValueInput";
import { PHRASE_KEYS, PhrasesEditor, TakesEditor } from "./verb-parts";
import { Checkbox, InlineField, ItemProblemList } from "./widgets";

/** Every field of one verb: what it applies to and targets, reach, takes, steps and phrases. */
export function VerbEditor({
  verb,
  file,
  problems,
  ownerPath,
  onChange,
}: {
  verb: Verb;
  file: ItemFile;
  problems: readonly ItemProblem[];
  ownerPath: string;
  onChange: (verb: Verb) => void;
}) {
  const update = (changes: Partial<Verb>) => onChange({ ...verb, ...changes });
  return (
    <div className="verb-editor">
      <ItemProblemList
        problems={problems.filter((problem) => !problem.path.startsWith(`${ownerPath}.steps.`))}
      />
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
              spot={{ file, owner: { kind: "verb", verb }, stepIndex: null }}
              onChange={(reach) => update({ reach })}
            />
          </InlineField>
        </div>
        <h4>Applies to (the item)</h4>
        <OptionalMatcherBuilder
          matcher={verb.appliesTo}
          file={file}
          allowsWhere
          showsMatches
          emptyLabel="bare-handed (no appliesTo)"
          onChange={(appliesTo) => update({ appliesTo })}
        />
        <h4>Target</h4>
        <OptionalMatcherBuilder
          matcher={verb.target}
          file={file}
          allowsWhere
          showsMatches
          emptyLabel="no target"
          onChange={(target) => update({ target })}
        />
      </section>
      <section className="form-section">
        <h4>Steps (run in order)</h4>
        <StepList
          steps={verb.steps}
          owner={{ kind: "verb", verb }}
          file={file}
          problems={problems}
          ownerPath={ownerPath}
          onChange={(steps) => update({ steps })}
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
    </div>
  );
}
