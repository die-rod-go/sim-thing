import type { Step } from "@village/shared";
import {
  CheckStepSettings,
  IfStepSettings,
  PickStepSettings,
  RollHitStepSettings,
  SleepStepSettings,
  WaitStepSettings,
} from "./StepSettingsNeeding";
import {
  AddStepSettings,
  ChangeStepSettings,
  DamageStepSettings,
  RemoveStepSettings,
  SetStepSettings,
} from "./StepSettingsData";
import {
  AnnounceStepSettings,
  ChangeNeedStepSettings,
  CreateStepSettings,
  DestroyStepSettings,
  InspectStepSettings,
  MoveStepSettings,
  ReadStepSettings,
  SendStepSettings,
  SoundStepSettings,
  TransformStepSettings,
} from "./StepSettingsWorld";
import type { StepSettingsProps } from "./step-settings-shared";

type AnyStepSettingsProps = Omit<StepSettingsProps<"wait">, "step" | "onChange"> & {
  step: Step;
  onChange: (step: Step) => void;
};

/** The settings that belong to the step's own type. */
export function StepSettings({ step, onChange, spot, file, isInRule }: AnyStepSettingsProps) {
  const shared = { spot, file, isInRule };
  switch (step.step) {
    case "require":
    case "use_up":
      return <PickStepSettings step={step} onChange={onChange} {...shared} />;
    case "check":
      return <CheckStepSettings step={step} onChange={onChange} {...shared} />;
    case "if":
      return <IfStepSettings step={step} onChange={onChange} {...shared} />;
    case "else":
    case "end_if":
      return null;
    case "wait":
      return <WaitStepSettings step={step} onChange={onChange} {...shared} />;
    case "sleep":
      return <SleepStepSettings step={step} onChange={onChange} {...shared} />;
    case "roll_hit":
      return <RollHitStepSettings step={step} onChange={onChange} {...shared} />;
    case "change":
      return <ChangeStepSettings step={step} onChange={onChange} {...shared} />;
    case "damage":
      return <DamageStepSettings step={step} onChange={onChange} {...shared} />;
    case "set":
      return <SetStepSettings step={step} onChange={onChange} {...shared} />;
    case "add":
      return <AddStepSettings step={step} onChange={onChange} {...shared} />;
    case "remove":
      return <RemoveStepSettings step={step} onChange={onChange} {...shared} />;
    case "move":
      return <MoveStepSettings step={step} onChange={onChange} {...shared} />;
    case "create":
      return <CreateStepSettings step={step} onChange={onChange} {...shared} />;
    case "transform":
      return <TransformStepSettings step={step} onChange={onChange} {...shared} />;
    case "destroy":
      return <DestroyStepSettings step={step} onChange={onChange} {...shared} />;
    case "send":
      return <SendStepSettings step={step} onChange={onChange} {...shared} />;
    case "sound":
      return <SoundStepSettings step={step} onChange={onChange} {...shared} />;
    case "announce":
      return <AnnounceStepSettings step={step} onChange={onChange} {...shared} />;
    case "change_need":
      return <ChangeNeedStepSettings step={step} onChange={onChange} {...shared} />;
    case "read":
      return <ReadStepSettings step={step} onChange={onChange} {...shared} />;
    case "inspect":
      return <InspectStepSettings step={step} onChange={onChange} {...shared} />;
  }
}
