import { describe, expect, it } from "vitest";
import { describeUnknownNames } from "./unknown-names";

describe("describeUnknownNames", () => {
  it("remembers a walk to a place that isn't there", () => {
    const notes = describeUnknownNames({
      value: { action: "walk_to", target: "river" },
      fields: ["target"],
    });
    expect(notes).toEqual([
      "I wanted to go to river, but I don't know of any place by that name, and no one by that name is in sight",
    ]);
  });

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
