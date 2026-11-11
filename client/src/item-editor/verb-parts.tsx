import type { ItemFile, Verb } from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { withoutKey } from "./list-edits";
import { Chips, InlineField } from "./widgets";

/** Items used up when the verb starts: definition id to count. */
export function InputsEditor({
  inputs,
  file,
  onChange,
}: {
  inputs: Verb["inputs"];
  file: ItemFile;
  onChange: (inputs: Verb["inputs"]) => void;
}) {
  const remaining = file.definitions
    .map((definition) => definition.id)
    .filter((id) => !Object.hasOwn(inputs, id));
  return (
    <span className="chip-row">
      {Object.entries(inputs).map(([definitionId, count]) => (
        <span key={definitionId} className="chip">
          {definitionId}
          <NumberInput
            value={count}
            min={1}
            onChange={(changed) => onChange({ ...inputs, [definitionId]: changed })}
          />
          <button
            className="icon-button"
            title={`Remove ${definitionId}`}
            onClick={() => onChange(withoutKey(inputs, definitionId))}
          >
            ×
          </button>
        </span>
      ))}
      {remaining.length > 0 && (
        <select
          className="editor-input item-select"
          value=""
          onChange={(event) => onChange({ ...inputs, [event.target.value]: 1 })}
        >
          <option value="">+ add</option>
          {remaining.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/** Held items needed but not used up; the field is left out when both lists are empty. */
export function ToolsEditor({
  tools,
  file,
  onChange,
}: {
  tools: Verb["tools"];
  file: ItemFile;
  onChange: (tools: Verb["tools"]) => void;
}) {
  const definitions = tools?.definitions ?? [];
  const properties = tools?.properties ?? [];
  const update = (next: { definitions: string[]; properties: string[] }) =>
    onChange(next.definitions.length + next.properties.length > 0 ? next : undefined);
  return (
    <>
      <InlineField label="items">
        <Chips
          values={definitions}
          options={file.definitions.map((definition) => definition.id)}
          onChange={(changed) => update({ definitions: changed, properties })}
        />
      </InlineField>
      <InlineField label="with properties">
        <Chips
          values={properties}
          options={Object.keys(file.properties)}
          onChange={(changed) => update({ definitions, properties: changed })}
        />
      </InlineField>
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
