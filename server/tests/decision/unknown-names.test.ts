import { describe, expect, it } from "vitest";
import { describeUnknownNames } from "../../src/decision/unknown-names";

describe("describeUnknownNames", () => {
  it("remembers looking for a thing that isn't here", () => {
    const notes = describeUnknownNames({
      value: { acts: [{ action: "interact", item: "nail box", target: "Mara" }] },
      fields: ["acts.0.item"],
    });
    expect(notes).toEqual([
      "I looked for nail box, but there was nothing and no one by that name here or on me",
    ]);
  });

  it("learns nothing from a rejection that names nothing", () => {
    const tooLong = { value: { acts: [{ say: "a very long line" }] }, fields: ["acts.0.say"] };
    expect(describeUnknownNames(tooLong)).toEqual([]);
    expect(describeUnknownNames({ value: null, fields: [] })).toEqual([]);
  });
});
