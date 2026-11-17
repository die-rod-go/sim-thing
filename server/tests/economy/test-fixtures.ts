import type { Agent } from "@village/shared";

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "mara",
    name: "Mara",
    pronouns: "",
    place: "bakery",
    pos: { x: 5, y: 5 },
    personality: {
      traits: {
        extraversion: 0,
        agreeableness: 0,
        conscientiousness: 0,
        neuroticism: 0,
        openness: 0,
      },
      core: "a careful baker",
      selfImage: "dependable",
    },
    body: { sleepRecoveryPerHour: 0.15, strength: 0.5, agility: 0.5 },
    profession: "baker",
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 },
    bodyChanges: {},
    starvingSinceTick: null,
    death: null,
    bodyReplacedById: null,
    bodyHolderId: null,
    mood: "calm",
    longTermGoals: [],
    shortTermGoals: [],
    intention: "",
    currentAction: null,
    awareness: {},
    people: {},
    seenPlaces: [],
    lastThought: null,
    ...overrides,
  };
}

export function withExtraversion(agent: Agent, extraversion: number): Agent {
  return {
    ...agent,
    personality: {
      ...agent.personality,
      traits: { ...agent.personality.traits, extraversion },
    },
  };
}
