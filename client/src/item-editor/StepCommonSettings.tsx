import { isBlockStep, type Step } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { hasRollHitBefore, withStepSetting } from "./step-edits";
import { Checkbox } from "./widgets";

const MAX_CHANCE = 1;

/** The quiet second line: chance, and running on after a missed hit. */
export function StepCommonSettings({
  step,
  steps,
  index,
  isInRule,
  onChange,
}: {
  step: Step;
  steps: readonly Step[];
  index: number;
  isInRule: boolean;
  onChange: (step: Step) => void;
}) {
  const isMarker = isBlockStep(step);
  const canSetChance = step.step !== "roll_hit" && !isMarker;
  const canSetEvenOnMiss =
    !isInRule && !isMarker && (hasRollHitBefore(steps, index) || step.evenOnMiss !== undefined);
  if (!canSetChance && !canSetEvenOnMiss) return null;
  return (
    <div className="step-common">
      {canSetChance && (
        <span className="step-common-item">
          <Checkbox
            label={step.chance === undefined ? "chance: always" : "chance"}
            checked={step.chance !== undefined}
            onChange={(isSet) =>
              onChange(
                withStepSetting(
                  step,
                  "chance",
                  isSet ? clientConfig.itemEditor.newStepChance : undefined,
                ),
              )
            }
          />
          {step.chance !== undefined && (
            <NumberInput
              value={step.chance}
              step={clientConfig.itemEditor.numberStep}
              min={0}
              onChange={(chance) =>
                onChange(withStepSetting(step, "chance", Math.min(Math.max(chance, 0), MAX_CHANCE)))
              }
            />
          )}
        </span>
      )}
      {canSetEvenOnMiss && (
        <Checkbox
          label="even after a miss"
          checked={step.evenOnMiss === true}
          onChange={(isSet) =>
            onChange(withStepSetting(step, "evenOnMiss", isSet ? true : undefined))
          }
        />
      )}
    </div>
  );
}
