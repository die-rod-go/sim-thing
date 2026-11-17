import { WORLD_MATCHER_SETTINGS, type ItemFile, type ItemProblem } from "@village/shared";
import { OptionalMatcherBuilder } from "./MatcherBuilder";
import { ComponentPathPicker, DefinitionPicker } from "./pickers";
import { selectProblemsUnder } from "./problems";
import { setWorldSetting } from "./world-edits";
import { InlineField, ItemProblemList } from "./widgets";

type WorldMatcherSetting = (typeof WORLD_MATCHER_SETTINGS)[number];

const MATCHER_SETTING_DESCRIPTIONS: Record<WorldMatcherSetting, string> = {
  sightBlockedBy: "Sight: a tile with a matching entity on it blocks sight.",
  movementBlockedBy:
    "Pathfinding: a tile with a matching entity on it is a wall, unless an in-passing verb applies to that entity.",
  soundMuffledBy: "Sound: passing a tile with a matching entity is muffled.",
  contentsHiddenBy: "Perception: nobody but its own agent sees what is inside a matching thing.",
  shownWhenCarried:
    'Perception: others see a matching entity directly inside an agent ("Tobias, carrying a knife").',
  lyingWhenOnTile:
    'Prompts: a matching entity on a tile reads as lying "on the floor", so a dropped knife is told apart from a placed oven.',
  closedSupply:
    "Validation only: warns when a verb or rule could make or destroy a matching thing.",
  noticeOnSight:
    "Attention: a creature matching this catches an agent's eye as it comes into view and gives it a decision; others are only seen.",
  placeListingOmits:
    'Prompts: things a place lists in "Places you know" leave out what matches (doors, windows, benches).',
};

/** The verbs whose doing turns the heads of whoever sees or hears it. */
function NoticedVerbsSetting({
  file,
  problems,
  onEdit,
}: {
  file: ItemFile;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  const noticed = file.world.noticedVerbs ?? [];
  const others = [...new Set(file.verbs.map((verb) => verb.name))].filter(
    (name) => !noticed.includes(name),
  );
  const setNoticed = (names: string[]) => onEdit(setWorldSetting(file, "noticedVerbs", names));
  return (
    <section className="form-section">
      <h4>noticedVerbs</h4>
      <p className="field-hint">
        Attention: someone doing one of these verbs interrupts whoever sees or hears it. Other
        people&apos;s verbs are only remembered.
      </p>
      {noticed.map((name) => (
        <InlineField key={name} label={name}>
          <button
            className="icon-button"
            title={`Stop noticing ${name}`}
            onClick={() => setNoticed(noticed.filter((candidate) => candidate !== name))}
          >
            Ã—
          </button>
        </InlineField>
      ))}
      <InlineField label="add">
        <select
          value=""
          onChange={(event) => {
            if (event.target.value !== "") setNoticed([...noticed, event.target.value]);
          }}
        >
          <option value="">a verbâ€¦</option>
          {others.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </InlineField>
      <ItemProblemList problems={selectSettingProblems(problems, "noticedVerbs")} />
    </section>
  );
}

function selectSettingProblems(problems: readonly ItemProblem[], setting: string): ItemProblem[] {
  return selectProblemsUnder(problems, `world.${setting}`);
}

const CREATURE_STAT_SETTINGS = [
  { setting: "creatureStrength", stat: "strength" },
  { setting: "creatureAgility", stat: "agility" },
] as const;

/** The number fields that are a creature's strength and agility; unset, creatures are middling. */
function CreatureStatSettings({
  file,
  problems,
  onEdit,
}: {
  file: ItemFile;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  return (
    <section className="form-section">
      <h4>creature stats</h4>
      <p className="field-hint">
        The number fields that are a creature&apos;s strength and agility. A creature without them,
        or with these unset, has middling ones.
      </p>
      {CREATURE_STAT_SETTINGS.map(({ setting, stat }) => (
        <div key={setting}>
          <InlineField label={stat}>
            <ComponentPathPicker
              value={file.world[setting] ?? ""}
              file={file}
              fieldTypes={["number"]}
              onChange={(path) => onEdit(setWorldSetting(file, setting, path))}
            />
            {file.world[setting] !== undefined && (
              <button
                className="icon-button"
                title={`Clear ${setting}`}
                onClick={() => onEdit(setWorldSetting(file, setting, undefined))}
              >
                ×
              </button>
            )}
          </InlineField>
          <ItemProblemList problems={selectSettingProblems(problems, setting)} />
        </div>
      ))}
    </section>
  );
}

/**
 * The settings the engine reads: its matchers, the verbs that catch the eye, the agent's body and
 * its health field, and the fields that are a creature's stats.
 */
export function WorldPage({
  file,
  problems,
  onEdit,
}: {
  file: ItemFile;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  return (
    <div className="character-form world-page">
      {WORLD_MATCHER_SETTINGS.map((setting) => (
        <section key={setting} className="form-section">
          <h4>{setting}</h4>
          <p className="field-hint">{MATCHER_SETTING_DESCRIPTIONS[setting]}</p>
          <OptionalMatcherBuilder
            matcher={file.world[setting]}
            file={file}
            allowsWhere={false}
            showsMatches
            emptyLabel="nothing"
            onChange={(matcher) => onEdit(setWorldSetting(file, setting, matcher))}
          />
          <ItemProblemList problems={selectSettingProblems(problems, setting)} />
        </section>
      ))}
      <NoticedVerbsSetting file={file} problems={problems} onEdit={onEdit} />
      <section className="form-section">
        <h4>agentBody</h4>
        <p className="field-hint">The definition of every agent&apos;s body.</p>
        <InlineField label="definition">
          <DefinitionPicker
            value={file.world.agentBody}
            file={file}
            onChange={(agentBody) => onEdit(setWorldSetting(file, "agentBody", agentBody))}
          />
        </InlineField>
        <ItemProblemList problems={selectSettingProblems(problems, "agentBody")} />
      </section>
      <section className="form-section">
        <h4>agentHealth</h4>
        <p className="field-hint">The number field that is an agent&apos;s health.</p>
        <InlineField label="field">
          <ComponentPathPicker
            value={file.world.agentHealth}
            file={file}
            fieldTypes={["number"]}
            onChange={(agentHealth) => onEdit(setWorldSetting(file, "agentHealth", agentHealth))}
          />
        </InlineField>
        <ItemProblemList problems={selectSettingProblems(problems, "agentHealth")} />
      </section>
      <CreatureStatSettings file={file} problems={problems} onEdit={onEdit} />
    </div>
  );
}
