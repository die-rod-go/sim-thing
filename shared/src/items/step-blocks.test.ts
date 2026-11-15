import { describe, expect, it } from "vitest";
import {
  canBothRun,
  findBlockBounds,
  findBlockProblems,
  isFirstWait,
  listBlockDepths,
} from "./step-blocks";
import type { Step } from "./step-schema";

const NESTED: Step[] = [
  { step: "if", on: "item", if: { has: "raw" } },
  { step: "if", on: "item", if: { has: "rotten" } },
  { step: "destroy", on: "item" },
  { step: "end_if" },
  { step: "else" },
  { step: "destroy", on: "item" },
  { step: "end_if" },
];

describe("if block markers", () => {
  it("finds the else and end_if of an if, skipping nested blocks", () => {
    expect(findBlockBounds(NESTED, 0)).toEqual({ elseIndex: 4, endIndex: 6 });
    expect(findBlockBounds(NESTED, 1)).toEqual({ elseIndex: null, endIndex: 3 });
  });

  it("indents steps inside blocks and keeps markers level with their if", () => {
    expect(listBlockDepths(NESTED)).toEqual([0, 1, 2, 1, 0, 1, 0]);
  });

  it("reports stray, doubled and unclosed markers", () => {
    expect(findBlockProblems(NESTED)).toEqual([]);
    expect(
      findBlockProblems([{ step: "else" }, { step: "end_if" }]).map((problem) => problem.index),
    ).toEqual([0, 1]);
    const doubled: Step[] = [
      { step: "if", if: { has: "raw" } },
      { step: "else" },
      { step: "else" },
    ];
    expect(findBlockProblems(doubled).map((problem) => problem.message)).toEqual([
      "An `if` can have only one `else`.",
      "This `if` needs an `end_if` below it.",
    ]);
  });
});

describe("which steps one run can reach", () => {
  const WAIT: Step = { step: "wait", minutes: 1 };
  const BRANCHED_WAITS: Step[] = [
    { step: "if", on: "item", if: { has: "raw" } },
    WAIT,
    { step: "else" },
    WAIT,
    { step: "end_if" },
    WAIT,
  ];

  it("never runs both branches of one if, nested or not", () => {
    expect(canBothRun(BRANCHED_WAITS, 1, 3)).toBe(false);
    expect(canBothRun(BRANCHED_WAITS, 1, 5)).toBe(true);
    expect(canBothRun(NESTED, 2, 5)).toBe(false);
  });

  it("takes the first wait of each branch as a first wait", () => {
    expect(isFirstWait(BRANCHED_WAITS, 1)).toBe(true);
    expect(isFirstWait(BRANCHED_WAITS, 3)).toBe(true);
    expect(isFirstWait(BRANCHED_WAITS, 5)).toBe(false);
    expect(isFirstWait([WAIT, WAIT], 1)).toBe(false);
    expect(isFirstWait([WAIT], 5)).toBe(false);
  });
});
