import { NEED_NAMES } from "@village/shared";
import { TextInput } from "../characters/fields";
import { ComponentPathPicker } from "./pickers";
import { PathFieldValues } from "./StepFieldValues";
import { DestinationSettings, OnSettings } from "./StepSettingsParts";
import { Setting, withSettings, type StepSettingsProps } from "./step-settings-shared";
import { listStimuli } from "./verb-edits";
import {
  DefinitionValueInput,
  NumberValueInput,
  OptionalNumberValueInput,
  TextValueInput,
} from "./ValueInput";
import { Checkbox, Choice } from "./widgets";

function buildUpdater<StepValue extends Parameters<typeof withSettings>[0]>(
  step: StepValue,
  onChange: (step: StepValue) => void,
) {
  return (changes: Record<string, unknown>) => onChange(withSettings(step, changes));
}

export function MoveStepSettings({ step, onChange, spot, isInRule }: StepSettingsProps<"move">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <DestinationSettings step={step} spot={spot} onChange={update} />
    </>
  );
}

export function CreateStepSettings({ step, onChange, spot, file }: StepSettingsProps<"create">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <Setting label="item">
        <DefinitionValueInput value={step.item} spot={spot} onChange={(item) => update({ item })} />
      </Setting>
      <Setting label="count">
        <NumberValueInput value={step.count} spot={spot} onChange={(count) => update({ count })} />
      </Setting>
      <DestinationSettings step={step} spot={spot} onChange={update} />
      <PathFieldValues
        fields={step.fields}
        file={file}
        spot={spot}
        onChange={(fields) => update({ fields })}
      />
      <Setting label="as">
        <TextInput
          value={step.as ?? ""}
          placeholder="no name"
          onChange={(name) => update({ as: name === "" ? undefined : name })}
        />
      </Setting>
    </>
  );
}

export function TransformStepSettings({
  step,
  onChange,
  spot,
  isInRule,
}: StepSettingsProps<"transform">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="into">
        <DefinitionValueInput value={step.into} spot={spot} onChange={(into) => update({ into })} />
      </Setting>
    </>
  );
}

export function DestroyStepSettings({
  step,
  onChange,
  spot,
  isInRule,
}: StepSettingsProps<"destroy">) {
  return (
    <OnSettings
      step={step}
      spot={spot}
      isInRule={isInRule}
      onChange={buildUpdater(step, onChange)}
    />
  );
}

export function SendStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"send">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="stimulus">
        <TextValueInput
          value={step.stimulus}
          spot={spot}
          suggestions={listStimuli(file)}
          onChange={(stimulus) => update({ stimulus })}
        />
      </Setting>
    </>
  );
}

export function SoundStepSettings({ step, onChange, spot, isInRule }: StepSettingsProps<"sound">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="loudness">
        <NumberValueInput
          value={step.loudness}
          spot={spot}
          onChange={(loudness) => update({ loudness })}
        />
      </Setting>
    </>
  );
}

export function AnnounceStepSettings({
  step,
  onChange,
  spot,
  isInRule,
}: StepSettingsProps<"announce">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="text">
        <TextInput value={step.text} onChange={(text) => update({ text })} />
      </Setting>
      <Checkbox
        label="private"
        checked={step.isPrivate}
        onChange={(isPrivate) => update({ isPrivate })}
      />
    </>
  );
}

export function ChangeNeedStepSettings({
  step,
  onChange,
  spot,
  isInRule,
}: StepSettingsProps<"change_need">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="need">
        <Choice value={step.need} choices={NEED_NAMES} onChange={(need) => update({ need })} />
      </Setting>
      <Setting label="amount">
        <NumberValueInput
          value={step.amount}
          spot={spot}
          onChange={(amount) => update({ amount })}
        />
      </Setting>
      <OptionalNumberValueInput
        value={step.perOtherUser}
        spot={spot}
        emptyLabel="per other user"
        onChange={(perOtherUser) => update({ perOtherUser })}
      />
    </>
  );
}

export function ReadStepSettings({
  step,
  onChange,
  spot,
  file,
  isInRule,
}: StepSettingsProps<"read">) {
  const update = buildUpdater(step, onChange);
  return (
    <>
      <OnSettings step={step} spot={spot} isInRule={isInRule} onChange={update} />
      <Setting label="field">
        <ComponentPathPicker
          value={step.field}
          file={file}
          fieldTypes={["text"]}
          onChange={(field) => update({ field })}
        />
      </Setting>
      <Setting label="author">
        <Checkbox
          label={step.author === undefined ? "none" : "from field"}
          checked={step.author !== undefined}
          onChange={(isSet) => update({ author: isSet ? step.field : undefined })}
        />
        {step.author !== undefined && (
          <ComponentPathPicker
            value={step.author}
            file={file}
            fieldTypes={["text"]}
            onChange={(author) => update({ author })}
          />
        )}
      </Setting>
    </>
  );
}
