import { useState } from "react";
import type { StepType } from "@village/shared";
import { STEP_DESCRIPTIONS, STEP_GROUPS, listAllowedStepTypes } from "./step-catalog";

/** The "+ step" button and the grouped list of step types it opens. */
export function StepPalette({
  ownerKind,
  onPick,
}: {
  ownerKind: "verb" | "rule";
  onPick: (type: StepType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    return (
      <button className="icon-button add-button" onClick={() => setIsOpen(true)}>
        + step
      </button>
    );
  }
  const allowed = new Set(listAllowedStepTypes(ownerKind));
  return (
    <div className="step-palette">
      {STEP_GROUPS.map((group) => {
        const types = group.types.filter((type) => allowed.has(type));
        if (types.length === 0) return null;
        return (
          <div key={group.label} className="step-palette-group">
            <h5>{group.label}</h5>
            {types.map((type) => (
              <button
                key={type}
                className="step-palette-item"
                onClick={() => {
                  onPick(type);
                  setIsOpen(false);
                }}
              >
                <strong>{type}</strong>
                <span className="field-hint">{STEP_DESCRIPTIONS[type]}</span>
              </button>
            ))}
          </div>
        );
      })}
      <button className="icon-button" onClick={() => setIsOpen(false)}>
        cancel
      </button>
    </div>
  );
}
