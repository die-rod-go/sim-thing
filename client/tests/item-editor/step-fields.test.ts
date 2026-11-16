import { describe, expect, it } from "vitest";
import {
  selectStepProblems,
  withRecordEntry,
  withRecordKeyRenamed,
} from "../../src/item-editor/step-fields";

describe("selectStepProblems", () => {
  it("picks a step's own problems without those of steps whose index starts the same", () => {
    const problems = [
      { severity: "error" as const, path: "verbs.0 (eat).steps.1", message: "one" },
      { severity: "error" as const, path: "verbs.0 (eat).steps.1.field", message: "inner" },
      { severity: "error" as const, path: "verbs.0 (eat).steps.10", message: "ten" },
    ];
    const picked = selectStepProblems(problems, "verbs.0 (eat)", 1);
    expect(picked.map((problem) => problem.message)).toEqual(["one", "inner"]);
  });
});

describe("withRecordEntry", () => {
  it("adds, replaces and removes entries", () => {
    const added = withRecordEntry(undefined, "a.b", 1);
    expect(added).toEqual({ "a.b": 1 });
    expect(withRecordEntry(added, "a.b", 2)).toEqual({ "a.b": 2 });
    expect(withRecordEntry(added, "a.b", undefined)).toBeUndefined();
  });
});

describe("withRecordKeyRenamed", () => {
  it("renames a key in place", () => {
    expect(withRecordKeyRenamed({ x: 1, y: 2 }, "x", "z")).toEqual({ z: 1, y: 2 });
  });
});
