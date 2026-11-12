import { describe, expect, it } from "vitest";
import type { Step } from "@village/shared";
import {
  hasRollHitBefore,
  insertStep,
  isAfterRollHit,
  isFirstWait,
  listStepDividers,
  moveStep,
  removeStep,
  replaceStep,
  withStepSetting,
} from "./step-edits";

const first: Step = { step: "destroy", on: "item" };
const second: Step = { step: "wait", minutes: 1 };
const third: Step = { step: "roll_hit", chance: 0.5 };
const fourth: Step = { step: "wait", minutes: 2 };
const names = (steps: readonly Step[]) => steps.map((step) => step.step);

describe("editing a list of steps", () => {
  const steps = [first, second, third];

  it("inserts a step at a position, clamping to the ends", () => {
    expect(names(insertStep(steps, 1, fourth))).toEqual(["destroy", "wait", "wait", "roll_hit"]);
    expect(insertStep(steps, 99, fourth)[3]).toBe(fourth);
    expect(insertStep(steps, -4, fourth)[0]).toBe(fourth);
  });

  it("removes and replaces the step at an index", () => {
    expect(names(removeStep(steps, 0))).toEqual(["wait", "roll_hit"]);
    expect(replaceStep(steps, 2, fourth)[2]).toBe(fourth);
  });

  it("moves a step and leaves the list alone when out of range", () => {
    expect(names(moveStep(steps, 0, 2))).toEqual(["wait", "roll_hit", "destroy"]);
    expect(moveStep(steps, 0, 3)).toEqual(steps);
    expect(moveStep(steps, 5, 0)).toEqual(steps);
  });

  it("sets a setting and removes it when cleared", () => {
    const withChance = withStepSetting(first, "chance", 0.3);
    expect(withChance.chance).toBe(0.3);
    expect("chance" in withStepSetting(withChance, "chance", undefined)).toBe(false);
  });
});

describe("step dividers", () => {
  const attack: Step[] = [first, second, third, { step: "damage", field: "a.b", amount: 1 }];

  it("marks when a verb with a wait starts and finishes", () => {
    expect(listStepDividers([first, second, first], "verb")).toEqual([
      { beforeIndex: 0, label: "when it starts" },
      { beforeIndex: 2, label: "when it finishes" },
    ]);
  });

  it("says after the next wait for a second wait", () => {
    const labels = listStepDividers([second, first, fourth], "verb").map((entry) => entry.label);
    expect(labels).toEqual(["when it starts", "when it finishes", "after the next wait"]);
  });

  it("marks on a hit below each roll_hit, in list order", () => {
    expect(listStepDividers(attack, "verb")).toEqual([
      { beforeIndex: 0, label: "when it starts" },
      { beforeIndex: 2, label: "when it finishes" },
      { beforeIndex: 3, label: "on a hit" },
    ]);
  });

  it("gives a verb without a wait no starting marker", () => {
    expect(listStepDividers([third, first], "verb")).toEqual([
      { beforeIndex: 1, label: "on a hit" },
    ]);
  });

  it("gives rules no dividers", () => {
    expect(listStepDividers(attack, "rule")).toEqual([]);
  });

  it("knows which steps come after a roll_hit and which wait is first", () => {
    expect(hasRollHitBefore(attack, 2)).toBe(false);
    expect(isAfterRollHit(attack, 3)).toBe(true);
    expect(isFirstWait([second, fourth], 0)).toBe(true);
    expect(isFirstWait([second, fourth], 1)).toBe(false);
    expect(isFirstWait([second, fourth], 5)).toBe(false);
  });
});
