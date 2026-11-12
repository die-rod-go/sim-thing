import { describe, expect, it } from "vitest";
import { completeNextStep, describePlanFocus, describePlanLines } from "./plans";

const PLANS = [
  {
    aim: "Win Bob over",
    steps: ["Bring bread", "Ask about the mill", "Offer coins"],
    keepFrom: "Clara",
  },
  { aim: "Rest", steps: [], keepFrom: "" },
];

describe("plans", () => {
  it("stepDone removes the next step of that plan only", () => {
    const completed = completeNextStep(PLANS, 1);
    expect(completed[0]?.steps).toEqual(["Ask about the mill", "Offer coins"]);
    expect(completed[1]).toEqual(PLANS[1]);
  });

  it("ignores a plan number that matches no plan", () => {
    expect(completeNextStep(PLANS, 0)).toEqual(PLANS);
    expect(completeNextStep(PLANS, 3)).toEqual(PLANS);
  });

  it("renders each plan with its next step, later steps and who to keep it from", () => {
    expect(describePlanLines(PLANS)).toEqual([
      "Plan 1: Win Bob over. Next: Bring bread. Then: Ask about the mill; Offer coins. Keep it from: Clara.",
      "Plan 2: Rest.",
    ]);
  });

  it("puts aims and next steps in the recall cue text", () => {
    expect(describePlanFocus(PLANS)).toContain("Bring bread");
    expect(describePlanFocus(PLANS)).not.toContain("Offer coins");
  });
});
