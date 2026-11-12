import { ComponentPicker, ComponentPathPicker } from "./pickers";
import { ComponentFieldValues } from "./StepFieldValues";
import { OnSettings } from "./StepSettingsParts";
import { findFieldDeclaration } from "./step-fields";
import { Setting, withSettings, type StepSettingsProps } from "./step-settings-shared";
import { FieldSlotValueInput, NumberValueInput, OptionalNumberValueInput } from "./ValueInput";
import { Checkbox } from "./widgets";

export function ChangeStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"change">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="field">
        <ComponentPathPicker
          value={step.field}
          file={file}
          fieldTypes={["number"]}
          onChange={(field) => update({ field })}
        />
      </Setting>
      <Setting label="by">
        <NumberValueInput value={step.by} spot={spot} onChange={(by) => update({ by })} />
      </Setting>
    </>
  );
}

export function DamageStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"damage">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="field">
        <ComponentPathPicker
          value={step.field}
          file={file}
          fieldTypes={["number"]}
          onChange={(field) => update({ field })}
        />
      </Setting>
      <Setting label="amount">
        <NumberValueInput
          value={step.amount}
          spot={spot}
          onChange={(amount) => update({ amount })}
        />
      </Setting>
      {!isInRule && (
        <Checkbox
          label="scaled by the user's strength"
          checked={step.scaledByStrength === true}
          onChange={(isScaled) => update({ scaledByStrength: isScaled ? true : undefined })}
        />
      )}
    </>
  );
}

export function SetStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"set">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="field">
        <ComponentPathPicker
          value={step.field}
          file={file}
          onChange={(field) => update({ field })}
        />
      </Setting>
      <Setting label="to">
        <FieldSlotValueInput
          value={step.to}
          spot={spot}
          field={findFieldDeclaration(file, step.field)}
          onChange={(to) => update({ to })}
        />
      </Setting>
    </>
  );
}

export function AddStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"add">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="component">
        <ComponentPicker
          value={step.component}
          file={file}
          onChange={(component) => update({ component, fields: undefined })}
        />
      </Setting>
      <OptionalNumberValueInput
        value={step.minutes}
        spot={spot}
        emptyLabel="for minutes (else until removed)"
        onChange={(minutes) => update({ minutes })}
      />
      <ComponentFieldValues
        component={step.component}
        fields={step.fields}
        file={file}
        spot={spot}
        onChange={(fields) => update({ fields })}
      />
    </>
  );
}

export function RemoveStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"remove">) {
  const update = (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="component">
        <ComponentPicker
          value={step.component}
          file={file}
          onChange={(component) => update({ component })}
        />
      </Setting>
    </>
  );
}
