import type { ItemFile, Step, StepOfType, StepType } from "@village/shared";
import type { ReactNode } from "react";
import type { ValueSpot } from "./step-owner";
import { InlineField } from "./widgets";

/** What each step type's settings component gets; `onChange` takes the whole changed step. */
export interface StepSettingsProps<Type extends StepType> {
  step: StepOfType<Type>;
  onChange: (step: StepOfType<Type>) => void;
  spot: ValueSpot;
  file: ItemFile;
  isInRule: boolean;
}

/** Sets or removes (undefined) several settings at once. */
export function withSettings<StepValue extends Step>(
  step: StepValue,
  changes: Readonly<Record<string, unknown>>,
): StepValue {
  const kept = Object.entries(step).filter(([name]) => !(name in changes));
  const added = Object.entries(changes).filter(([, value]) => value !== undefined);
  return Object.fromEntries([...kept, ...added]) as StepValue;
}

export function Setting({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <InlineField label={label}>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </InlineField>
  );
}
