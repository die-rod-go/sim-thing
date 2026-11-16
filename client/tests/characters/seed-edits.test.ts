import { describe, expect, it } from "vitest";
import type { SeedAgent, SeedFile } from "@village/shared";
import {
  addAgent,
  duplicateAgent,
  listPersonSubjects,
  moveAgent,
  removeAgent,
  renameAgent,
  setPersonEntry,
  withoutBlankPeople,
} from "../../src/characters/seed-edits";

function buildSeedAgent(name: string, overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: name.toLowerCase(),
    name,
    profession: "",
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
    people: {},
    seenPlaces: [],
    ...overrides,
  };
}

const village: SeedFile = {
  agents: [
    buildSeedAgent("Mara", {
      people: {
        Edwin: { whatIThinkOfThem: "Stubborn." },
        Wren: { whatIThinkOfThem: "Eager." },
      },
    }),
    buildSeedAgent("Edwin", { people: { mara: { whatIThinkOfThem: "Fair dealer." } } }),
    buildSeedAgent("Wren"),
  ],
};

describe("renameAgent", () => {
  it("moves what others hold about them to the new name, matching the old name in any case", () => {
    const renamed = renameAgent(village, 0, "Marga");
    expect(renamed.agents[0]).toMatchObject({ name: "Marga", id: "marga" });
    expect(renamed.agents[1]?.people).toEqual({ Marga: { whatIThinkOfThem: "Fair dealer." } });
  });

  it("keeps a hand-picked id when the name changes", () => {
    const customId = { agents: [buildSeedAgent("Mara", { id: "baker" })] };
    expect(renameAgent(customId, 0, "Marga").agents[0]?.id).toBe("baker");
  });

  it("leaves people alone when the name is cleared", () => {
    expect(renameAgent(village, 0, "").agents[1]?.people).toEqual({
      mara: { whatIThinkOfThem: "Fair dealer." },
    });
  });
});

describe("removeAgent", () => {
  it("drops the character and what everyone holds about them", () => {
    const withoutEdwin = removeAgent(village, 1);
    expect(withoutEdwin.agents.map((agent) => agent.name)).toEqual(["Mara", "Wren"]);
    expect(withoutEdwin.agents[0]?.people).toEqual({ Wren: { whatIThinkOfThem: "Eager." } });
  });
});

describe("addAgent", () => {
  it("appends a copy of the template, not the template itself", () => {
    const template = buildSeedAgent("", { id: "" });
    const added = addAgent(village, template);
    expect(added.agents).toHaveLength(4);
    expect(added.agents[3]).toEqual(template);
    expect(added.agents[3]).not.toBe(template);
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
    expect(copied.agents[1]?.people).toEqual(village.agents[0]?.people);
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

describe("people", () => {
  it("lists other villagers, plus people held who are not in the village", () => {
    const withStranger = {
      agents: [
        setPersonEntry(village.agents[0] ?? buildSeedAgent("Mara"), "Old Master", {
          whatTheyWantFromMe: "My silence.",
        }),
        ...village.agents.slice(1),
      ],
    };
    expect(listPersonSubjects(withStranger, 0)).toEqual({
      villagers: ["Edwin", "Wren"],
      strangers: ["Old Master"],
    });
  });

  it("does not save blank fields, or people with nothing filled in", () => {
    const blank = {
      agents: [
        buildSeedAgent("Mara", {
          people: {
            Edwin: { whatIThinkOfThem: " " },
            Wren: { whatIThinkOfThem: "Eager.", whatIWantFromThem: "" },
          },
        }),
      ],
    };
    expect(withoutBlankPeople(blank).agents[0]?.people).toEqual({
      Wren: { whatIThinkOfThem: "Eager." },
    });
  });
});
