import { useState } from "react";
import type { Step, StepType } from "@village/shared";
import { StepCommonSettings } from "./StepCommonSettings";
import { StepPalette } from "./StepPalette";
import { StepSettings } from "./StepSettings";
import type { StepListProps } from "./step-list-props";
import { findDropIndex, isBelowMiddleOf } from "./step-drag";
import { insertStep, listStepDividers, moveStep, removeStep, replaceStep } from "./step-edits";
import { selectStepProblems } from "./step-fields";
import { STEP_DESCRIPTIONS, buildNewStep } from "./step-catalog";
import { ItemProblemList } from "./widgets";

export type { StepListProps } from "./step-list-props";

interface DragState {
  fromIndex: number;
  overIndex: number;
  isBelowMiddle: boolean;
}

/** The ordered steps of a verb or rule: dividers, rows with settings, and a palette to add more. */
export function StepList({ steps, owner, file, problems, ownerPath, onChange }: StepListProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Only the handle starts a drag, so selecting text in a row's inputs doesn't move the row.
  const [grabbedIndex, setGrabbedIndex] = useState<number | null>(null);
  const isInRule = owner.kind === "rule";
  const dividers = listStepDividers(steps, owner.kind);
  const renderDividers = (beforeIndex: number) =>
    dividers
      .filter((divider) => divider.beforeIndex === beforeIndex)
      .map((divider) => (
        <div key={`divider-${divider.label}-${beforeIndex}`} className="step-divider">
          {divider.label}
        </div>
      ));
  const addStep = (type: StepType) =>
    onChange(
      insertStep(steps, steps.length, buildNewStep(type, { file, owner, stepIndex: steps.length })),
    );
  const drop = () => {
    if (drag !== null) {
      const target = { overIndex: drag.overIndex, isBelowMiddle: drag.isBelowMiddle };
      onChange(moveStep(steps, drag.fromIndex, findDropIndex(drag.fromIndex, target)));
    }
    setDrag(null);
  };
  const dropClass = (index: number) => {
    if (drag === null || drag.overIndex !== index) return "";
    return drag.isBelowMiddle ? " drop-below" : " drop-above";
  };
  return (
    <div className="step-list">
      {steps.map((step: Step, index) => (
        <div key={index}>
          {renderDividers(index)}
          <div
            className={`step-row${dropClass(index)}`}
            draggable={grabbedIndex === index}
            onDragStart={() =>
              setDrag({ fromIndex: index, overIndex: index, isBelowMiddle: false })
            }
            onDragEnd={() => {
              setDrag(null);
              setGrabbedIndex(null);
            }}
            onDragOver={(event) => {
              if (drag === null) return;
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              setDrag({
                ...drag,
                overIndex: index,
                isBelowMiddle: isBelowMiddleOf(box.top, box.height, event.clientY),
              });
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop();
            }}
          >
            <div className="step-head">
              <span
                className="step-handle"
                title="Drag to reorder"
                onMouseDown={() => setGrabbedIndex(index)}
                onMouseUp={() => setGrabbedIndex(null)}
              >
                ⠿
              </span>
              <strong className="step-name" title={STEP_DESCRIPTIONS[step.step]}>
                {step.step}
              </strong>
              <span className="field-hint">{STEP_DESCRIPTIONS[step.step]}</span>
              <span className="step-buttons">
                <button
                  className="icon-button"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => onChange(moveStep(steps, index, index - 1))}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  title="Move down"
                  disabled={index === steps.length - 1}
                  onClick={() => onChange(moveStep(steps, index, index + 1))}
                >
                  ↓
                </button>
                <button
                  className="icon-button"
                  title="Remove this step"
                  onClick={() => onChange(removeStep(steps, index))}
                >
                  ×
                </button>
              </span>
            </div>
            <div className="effect-fields">
              <StepSettings
                step={step}
                spot={{ file, owner, stepIndex: index }}
                file={file}
                isInRule={isInRule}
                onChange={(changed) => onChange(replaceStep(steps, index, changed))}
              />
            </div>
            <StepCommonSettings
              step={step}
              steps={steps}
              index={index}
              isInRule={isInRule}
              onChange={(changed) => onChange(replaceStep(steps, index, changed))}
            />
            <ItemProblemList problems={selectStepProblems(problems, ownerPath, index)} />
          </div>
        </div>
      ))}
      {renderDividers(steps.length)}
      <StepPalette ownerKind={owner.kind} onPick={addStep} />
    </div>
  );
}
