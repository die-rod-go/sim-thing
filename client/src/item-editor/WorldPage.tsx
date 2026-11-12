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
};

function selectSettingProblems(problems: readonly ItemProblem[], setting: string): ItemProblem[] {
  return selectProblemsUnder(problems, `world.${setting}`);
}

/** The settings the physics reads: seven matchers, the agent's body and its health field. */
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
    </div>
  );
}
