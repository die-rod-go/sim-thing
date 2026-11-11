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
  spawnPlaces: ["bakery", "rose cottage"],
  inventoryItems: [
    { id: "bread", name: "bread" },
    { id: "coin", name: "coin" },
  ],
};

function buildSeedAgent(overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: "mara",
    name: "Mara",
    profession: "baker",
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
    inventory: { bread: 2, coin: 30 },
    mood: "",
    goals: [],
    peopleNotes: {},
    ...overrides,
  };
}

function listFields(agents: SeedAgent[]): string[] {
  return findSeedFileProblems({ agents }, rules).map((problem) => problem.field);
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

  it("rejects a spawn place that is not on the map", () => {
    expect(listFields([buildSeedAgent({ spawnPlace: "the moon" })])).toEqual(["spawnPlace"]);
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

  it("only warns about unusual sleep recovery and notes about strangers", () => {
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
    expect(problems.map((problem) => problem.severity)).toEqual(["warning", "warning"]);
    expect(hasSeedErrors(problems)).toBe(false);
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
