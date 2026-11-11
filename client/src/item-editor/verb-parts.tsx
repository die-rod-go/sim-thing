import { VERB_TAKES, type Verb, type VerbTake } from "@village/shared";
import { TextInput } from "../characters/fields";
import { Checkbox, InlineField } from "./widgets";

/** What the decision supplies for this verb: how many, for how long, some text. */
export function TakesEditor({
  takes,
  onChange,
}: {
  takes: Verb["takes"];
  onChange: (takes: VerbTake[]) => void;
}) {
  return (
    <>
      {VERB_TAKES.map((take) => (
        <Checkbox
          key={take}
          label={`takes ${take}`}
          checked={takes.includes(take)}
          onChange={(isChecked) =>
            onChange(isChecked ? [...takes, take] : takes.filter((existing) => existing !== take))
          }
        />
      ))}
    </>
  );
}

export const PHRASE_KEYS = ["ongoing", "done", "attempt", "hit", "missed", "killed"] as const;

/** Phrase text with `{item}`, `{target}` placeholders; blank phrases are left out. */
export function PhrasesEditor({
  phrases,
  keys,
  onChange,
}: {
  phrases: Readonly<Partial<Record<string, string>>>;
  keys: readonly string[];
  onChange: (phrases: Record<string, string>) => void;
}) {
  const setPhrase = (key: string, text: string) => {
    const next = Object.fromEntries(
      Object.entries({ ...phrases, [key]: text }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
      ),
    );
    onChange(next);
  };
  return (
    <div className="phrase-grid">
      {keys.map((key) => (
        <InlineField key={key} label={key}>
          <TextInput value={phrases[key] ?? ""} onChange={(text) => setPhrase(key, text)} />
        </InlineField>
      ))}
    </div>
  );
}
