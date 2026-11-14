import { describe, expect, it } from "vitest";
import {
  findSeedFileProblems,
  hasSeedErrors,
  slugifyAgentName,
  type SeedAgent,
  type SeedRules,
} from "./seed-file";

const rules: SeedRules = {
  traitRange: { min: -1, max: 1 },
  statRange: { min: 0, max: 1 },
  sleepRecoveryRange: { min: 0.12, max: 0.18 },
  agentsWithStartTiles: ["mara"],
  inventoryItems: [
    { id: "bread", name: "bread" },
    { id: "coin", name: "coin" },
  ],
  placeNames: ["bakery", "town square"],
};

function buildSeedAgent(overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: "mara",
    name: "Mara",
    profession: "baker",
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
    inventory: { bread: 2, coin: 30 },
    mood: "",
    goals: [],
    peopleNotes: {},
    seenPlaces: [],
    ...overrides,
  };
}

/** Fields with problems, leaving out start tiles, which depend on the map rather than the agent. */
function listFields(agents: SeedAgent[]): string[] {
  return findSeedFileProblems({ agents }, rules)
    .map((problem) => problem.field)
    .filter((field) => field !== "start");
}

describe("findSeedFileProblems", () => {
  it("finds nothing wrong with a well-formed character", () => {
    expect(findSeedFileProblems({ agents: [buildSeedAgent()] }, rules)).toEqual([]);
  });

  it("needs at least one character", () => {
    const problems = findSeedFileProblems({ agents: [] }, rules);
    expect(hasSeedErrors(problems)).toBe(true);
  });

  it("rejects a second character with the same id or the same name in another case", () => {
    const problems = findSeedFileProblems(
      { agents: [buildSeedAgent(), buildSeedAgent({ name: "MARA" })] },
      rules,
    );
    expect(problems.map((problem) => [problem.agentIndex, problem.field])).toEqual([
      [1, "id"],
      [1, "name"],
    ]);
  });

  it("rejects ids that would not make clean memory ids", () => {
    expect(listFields([buildSeedAgent({ id: "Old Tom" })])).toEqual(["id"]);
    expect(listFields([buildSeedAgent({ id: "old-tom" })])).toEqual([]);
  });

  it("rejects traits outside the configured range", () => {
    const traits = { ...buildSeedAgent().traits, neuroticism: 1.5 };
    expect(listFields([buildSeedAgent({ traits })])).toEqual(["traits.neuroticism"]);
  });

  it("rejects strength and agility outside the configured range", () => {
    expect(listFields([buildSeedAgent({ strength: 1.2, agility: -0.1 })])).toEqual([
      "strength",
      "agility",
    ]);
    expect(listFields([buildSeedAgent({ strength: 0, agility: 1 })])).toEqual([]);
  });

  it("warns about a character with no start tile on the map", () => {
    const problems = findSeedFileProblems({ agents: [buildSeedAgent({ id: "ilsa" })] }, rules);
    expect(problems).toContainEqual(
      expect.objectContaining({ severity: "warning", field: "start" }),
    );
    expect(hasSeedErrors(problems)).toBe(false);
  });

  it("rejects fractional or negative inventory amounts, coins included", () => {
    expect(listFields([buildSeedAgent({ inventory: { bread: -1, coin: 2.5 } })])).toEqual([
      "inventory.bread",
      "inventory.coin",
    ]);
  });

  it("rejects an id that could be taken for an entity's", () => {
    expect(listFields([buildSeedAgent({ id: "entity-7" })])).toEqual(["id"]);
  });

  it("rejects inventory items an inventory can't hold", () => {
    expect(listFields([buildSeedAgent({ inventory: { lute: 1 } })])).toEqual(["inventory.lute"]);
  });

  it("warns about unusual sleep recovery and rejects a note about a stranger", () => {
    const problems = findSeedFileProblems(
      {
        agents: [
          buildSeedAgent({
            sleepRecoveryPerHour: 0.5,
            peopleNotes: { Gregor: "Who is he?" },
          }),
        ],
      },
      rules,
    );
    expect(problems.map((problem) => problem.severity)).toEqual(["warning", "error"]);
    expect(hasSeedErrors(problems)).toBe(true);
  });

  it("rejects a seen place that is not on the map", () => {
    expect(listFields([buildSeedAgent({ seenPlaces: ["bakery", "castle"] })])).toEqual([
      "seenPlaces",
    ]);
  });

  it("matches people notes to characters by name, ignoring case", () => {
    const agents = [
      buildSeedAgent({ peopleNotes: { edwin: "Stubborn." } }),
      buildSeedAgent({ id: "edwin", name: "Edwin" }),
    ];
    expect(listFields(agents)).toEqual([]);
  });
});

describe("slugifyAgentName", () => {
  it("lowercases, strips accents and joins words with dashes", () => {
    expect(slugifyAgentName("  Old Tóm the 2nd! ")).toBe("old-tom-the-2nd");
  });
});
