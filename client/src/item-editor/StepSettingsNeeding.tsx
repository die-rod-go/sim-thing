import { NumberInput, TextInput } from "../characters/fields";
import { MatcherBuilder } from "./MatcherBuilder";
import { ThingNamePicker } from "./pickers";
import { OnSettings } from "./StepSettingsParts";
import { isFirstWait } from "./step-edits";
import { Setting, withSettings, type StepSettingsProps } from "./step-settings-shared";
import { NumberValueInput, OptionalNumberValueInput } from "./ValueInput";

export function PickStepSettings({
  step,
  onChange,
  spot,
  file,
}: StepSettingsProps<"require" | "use_up">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <Setting label="in">
        <ThingNamePicker
          value={step.in}
          spot={spot}
          onChange={(name) => update({ in: name ?? step.in })}
        />
      </Setting>
      <Setting label="count">
        <NumberInput
          value={step.count}
          min={1}
          onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
        />
      </Setting>
      <Setting label="as">
        <TextInput
          value={step.as ?? ""}
          placeholder="no name"
          onChange={(name) => update({ as: name === "" ? undefined : name })}
        />
      </Setting>
      <MatcherBuilder
        matcher={step.rule}
        file={file}
        allowsWhere={false}
        onChange={(rule) => update({ rule })}
      />
    </>
  );
}

export function CheckStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"check">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <MatcherBuilder
        matcher={step.if}
        file={file}
        allowsWhere={false}
        onChange={(matcher) => update({ if: matcher })}
      />
      <Setting label="otherwise" hint="{item} and {target} are filled in">
        <TextInput value={step.otherwise} onChange={(otherwise) => update({ otherwise })} />
      </Setting>
    </>
  );
}

export function WaitStepSettings({ step, onChange, spot }: StepSettingsProps<"wait">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  const steps = spot.owner.kind === "verb" ? spot.owner.verb.steps : [];
  const canSetLoudness =
    spot.stepIndex !== null && isFirstWait(steps, spot.stepIndex)
      ? true
      : step.loudness !== undefined;
  return (
    <>
      <Setting label="minutes">
        <NumberValueInput
          value={step.minutes}
          spot={spot}
          onChange={(minutes) => update({ minutes })}
        />
      </Setting>
      {canSetLoudness && (
        <OptionalNumberValueInput
          value={step.loudness}
          spot={spot}
          emptyLabel="loudness"
          onChange={(loudness) => update({ loudness })}
        />
      )}
    </>
  );
}

export function SleepStepSettings({ step, onChange, spot }: StepSettingsProps<"sleep">) {
  return (
    <OptionalNumberValueInput
      value={step.minutes}
      spot={spot}
      emptyLabel="for minutes (else until woken)"
      onChange={(minutes) => onChange(withSettings(step, { minutes }))}
    />
  );
}

export function RollHitStepSettings({ step, onChange, spot }: StepSettingsProps<"roll_hit">) {
  return (
    <Setting label="chance">
      <NumberValueInput
        value={step.chance}
        spot={spot}
        onChange={(chance) => onChange({ ...step, chance })}
      />
    </Setting>
  );
}
