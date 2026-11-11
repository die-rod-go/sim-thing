import { describe, expect, it } from "vitest";
import type { SeedAgent, SeedFile } from "@village/shared";
import {
  addAgent,
  duplicateAgent,
  listNoteSubjects,
  moveAgent,
  removeAgent,
  renameAgent,
  setPersonNote,
  withoutBlankNotes,
} from "./seed-edits";

function buildSeedAgent(name: string, overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: name.toLowerCase(),
    name,
    profession: "",
    spawnPlace: "rose cottage",
    traits: {
      extraversion: 0,
      agreeableness: 0,
      conscientiousness: 0,
      neuroticism: 0,
      openness: 0,
    },
    core: "",
    selfImage: "",
    sleepRecoveryPerHour: 0.15,
    strength: 0.5,
    agility: 0.5,
    inventory: { coin: 30 },
    mood: "",
    goals: [],
    peopleNotes: {},
    ...overrides,
  };
}

const village: SeedFile = {
  agents: [
    buildSeedAgent("Mara", { peopleNotes: { Edwin: "Stubborn.", Wren: "Eager." } }),
    buildSeedAgent("Edwin", { spawnPlace: "ivy cottage", peopleNotes: { mara: "Fair dealer." } }),
    buildSeedAgent("Wren", { spawnPlace: "stone cottage" }),
  ],
};

describe("renameAgent", () => {
  it("moves other characters' notes to the new name, matching the old name in any case", () => {
    const renamed = renameAgent(village, 0, "Marga");
    expect(renamed.agents[0]).toMatchObject({ name: "Marga", id: "marga" });
    expect(renamed.agents[1]?.peopleNotes).toEqual({ Marga: "Fair dealer." });
  });

  it("keeps a hand-picked id when the name changes", () => {
    const customId = { agents: [buildSeedAgent("Mara", { id: "baker" })] };
    expect(renameAgent(customId, 0, "Marga").agents[0]?.id).toBe("baker");
  });

  it("leaves notes alone when the name is cleared", () => {
    expect(renameAgent(village, 0, "").agents[1]?.peopleNotes).toEqual({ mara: "Fair dealer." });
  });
});

describe("removeAgent", () => {
  it("drops the character and everyone's notes about them", () => {
    const withoutEdwin = removeAgent(village, 1);
    expect(withoutEdwin.agents.map((agent) => agent.name)).toEqual(["Mara", "Wren"]);
    expect(withoutEdwin.agents[0]?.peopleNotes).toEqual({ Wren: "Eager." });
  });
});

describe("addAgent", () => {
  it("starts a new character at a spawn place nobody uses yet", () => {
    const template = buildSeedAgent("", { id: "", spawnPlace: "rose cottage" });
    const spawnPlaces = ["ivy cottage", "rose cottage", "stone cottage", "town square"];
    const added = addAgent(village, template, spawnPlaces);
    expect(added.agents).toHaveLength(4);
    expect(added.agents[3]?.spawnPlace).toBe("town square");
  });
});

describe("duplicateAgent", () => {
  it("inserts a copy after the original with its own name and id", () => {
    const copied = duplicateAgent(duplicateAgent(village, 0), 0);
    expect(copied.agents.map((agent) => agent.id)).toEqual([
      "mara",
      "mara-copy-2",
      "mara-copy",
      "edwin",
      "wren",
    ]);
    expect(copied.agents[1]?.peopleNotes).toEqual(village.agents[0]?.peopleNotes);
  });
});

describe("moveAgent", () => {
  it("swaps a character with its neighbour and ignores moves off the ends", () => {
    expect(moveAgent(village, 1, -1).agents.map((agent) => agent.name)).toEqual([
      "Edwin",
      "Mara",
      "Wren",
    ]);
    expect(moveAgent(village, 0, -1)).toBe(village);
  });
});

describe("people notes", () => {
  it("lists other villagers, plus note subjects who are not in the village", () => {
    const withStranger = {
      agents: [
        setPersonNote(village.agents[0] ?? buildSeedAgent("Mara"), "Old Master", "Accused me."),
        ...village.agents.slice(1),
      ],
    };
    expect(listNoteSubjects(withStranger, 0)).toEqual({
      villagers: ["Edwin", "Wren"],
      strangers: ["Old Master"],
    });
  });

  it("does not save blank notes", () => {
    const blank = {
      agents: [buildSeedAgent("Mara", { peopleNotes: { Edwin: " ", Wren: "Eager." } })],
    };
    expect(withoutBlankNotes(blank).agents[0]?.peopleNotes).toEqual({ Wren: "Eager." });
  });
});
