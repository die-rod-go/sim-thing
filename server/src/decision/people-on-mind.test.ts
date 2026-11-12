import { describe, expect, it } from "vitest";
import { config } from "../config";
import { listPeopleOnMind } from "./people-on-mind";

const others = [
  { id: "bob", name: "Bob" },
  { id: "clara", name: "Clara" },
  { id: "dan", name: "Dan" },
  { id: "eve", name: "Eve" },
  { id: "finn", name: "Finn" },
  { id: "gus", name: "Gus" },
];
const dossiers = Object.fromEntries(
  others.map((person) => [person.id, { text: `${person.name} notes`, updatedTick: 0 }]),
);
const base = { others, dossiers, inSightIds: [], speakerNames: [], mentioningTexts: [] };

function names(entries: { name: string }[]): string[] {
  return entries.map((entry) => entry.name);
}

describe("listPeopleOnMind", () => {
  it("lists people in sight, then speakers, then people named, without repeats", () => {
    const people = listPeopleOnMind({
      ...base,
      inSightIds: ["clara"],
      speakerNames: ["Dan", "Clara"],
      mentioningTexts: ["I want to ask Bob and Dan about the well"],
    });
    expect(names(people)).toEqual(["Clara", "Dan", "Bob"]);
    expect(people[0]?.text).toBe("Clara notes");
  });

  it("shows at most the configured number of people", () => {
    const people = listPeopleOnMind({ ...base, inSightIds: others.map((person) => person.id) });
    expect(people).toHaveLength(config.dossier.shownInDecision);
    expect(names(people)).toEqual(["Bob", "Clara", "Dan", "Eve", "Finn"]);
  });

  it("gives a placeholder only to people who are present, and skips others without a dossier", () => {
    const people = listPeopleOnMind({
      ...base,
      dossiers: {},
      inSightIds: ["bob"],
      speakerNames: ["Clara"],
      mentioningTexts: ["Dan owes me"],
    });
    expect(people).toEqual([
      { name: "Bob", text: config.dossier.unknownPersonText },
      { name: "Clara", text: config.dossier.unknownPersonText },
    ]);
  });

  it("matches names as whole words only", () => {
    const people = listPeopleOnMind({ ...base, mentioningTexts: ["Danger at the well"] });
    expect(people).toEqual([]);
  });
});
