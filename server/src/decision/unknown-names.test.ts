import { describe, expect, it } from "vitest";
import { describeUnknownNames } from "./unknown-names";

describe("describeUnknownNames", () => {
  it("remembers looking for a thing that isn't here", () => {
    const notes = describeUnknownNames({
      value: { action: "interact", item: "nail box", target: "Mara" },
      fields: ["item"],
    });
    expect(notes).toEqual([
      "I looked for nail box, but there was nothing and no one by that name here or on me",
    ]);
  });

  it("learns nothing from a rejection that names nothing", () => {
    expect(describeUnknownNames({ value: { say: "a very long line" }, fields: ["say"] })).toEqual(
      [],
    );
    expect(describeUnknownNames({ value: null, fields: [] })).toEqual([]);
  });
});
