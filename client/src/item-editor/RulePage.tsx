import type { ItemFile, ItemProblem, Rule } from "@village/shared";
import { clientConfig } from "../client-config";
import { NumberInput, TextInput } from "../characters/fields";
import { MatcherBuilder, MatcherMatches } from "./MatcherBuilder";
import { formatEntryPath, selectEntryProblems } from "./problems";
import { changeRuleTrigger, RULE_TRIGGERS, updateRule, type RuleTrigger } from "./rules-edits";
import { StepList } from "./StepList";
import { Choice, InlineField, ItemProblemList, SuggestingInput } from "./widgets";

const TRIGGER_LABELS: Record<RuleTrigger, string> = {
  every: "every so many minutes",
  stimulus: "when a stimulus arrives",
  becomes: "when it becomes true",
};

function TriggerSetting({
  rule,
  stimuli,
  onChange,
}: {
  rule: Rule;
  stimuli: readonly string[];
  onChange: (rule: Rule) => void;
}) {
  if (rule.trigger === "every") {
    return (
      <InlineField label="minutes">
        <NumberInput
          value={rule.minutes}
          min={1}
          step={1}
          onChange={(minutes) => onChange({ ...rule, minutes: Math.max(1, Math.round(minutes)) })}
        />
      </InlineField>
    );
  }
  if (rule.trigger === "stimulus") {
    return (
      <InlineField label="stimulus">
        <SuggestingInput
          value={rule.stimulus}
          suggestions={stimuli}
          onChange={(stimulus) => onChange({ ...rule, stimulus })}
        />
      </InlineField>
    );
  }
  return null;
}

/** One rule: its trigger, the things it fires on, a death phrase and its steps. */
export function RulePage({
  file,
  index,
  problems,
  stimuli,
  onEdit,
}: {
  file: ItemFile;
  index: number;
  problems: readonly ItemProblem[];
  stimuli: readonly string[];
  onEdit: (file: ItemFile) => void;
}) {
  const rule = file.rules[index];
  if (!rule) return null;
  const ownerPath = formatEntryPath(file, "rules", index);
  const ownProblems = selectEntryProblems(problems, file, "rules", index).filter(
    (problem) => !problem.path.startsWith(`${ownerPath}.steps.`),
  );
  const update = (changed: Rule) => onEdit(updateRule(file, index, changed));
  return (
    <div className="character-form">
      <ItemProblemList problems={ownProblems} />
      <section className="form-section">
        <div className="effect-fields">
          <InlineField label="trigger">
            <Choice
              value={rule.trigger}
              choices={RULE_TRIGGERS}
              labels={TRIGGER_LABELS}
              onChange={(trigger) => update(changeRuleTrigger(rule, trigger, stimuli))}
            />
          </InlineField>
          <TriggerSetting rule={rule} stimuli={stimuli} onChange={update} />
        </div>
        <h4>If (the things it fires on)</h4>
        <MatcherBuilder
          matcher={rule.if}
          file={file}
          allowsWhere={false}
          onChange={(matcher) => update({ ...rule, if: matcher })}
        />
        <MatcherMatches matcher={rule.if} file={file} allowsWhere={false} />
        <InlineField label="killed">
          <TextInput
            value={rule.killed ?? ""}
            placeholder={clientConfig.itemEditor.killedPlaceholder}
            onChange={(killed) => update({ ...rule, killed: killed === "" ? undefined : killed })}
          />
        </InlineField>
      </section>
      <section className="form-section">
        <h4>Steps (run in order)</h4>
        <StepList
          steps={rule.steps}
          owner={{ kind: "rule", rule }}
          file={file}
          problems={problems}
          ownerPath={ownerPath}
          onChange={(steps) => update({ ...rule, steps })}
        />
      </section>
    </div>
  );
}
