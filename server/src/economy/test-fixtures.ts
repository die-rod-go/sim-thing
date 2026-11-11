import type { Agent, ObjectKind, WorldObject } from "@village/shared";
import { config } from "../config";

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "mara",
    name: "Mara",
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
    body: { sleepRecoveryPerHour: 0.15 },
    profession: "baker",
    coins: config.economy.startingCoins,
    inventory: {},
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 },
    mood: "calm",
    goals: [],
    dailyPlan: "",
    intention: "",
    currentAction: null,
    workingMemory: [],
    awareness: {},
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

export function makeObject(
  kind: ObjectKind,
  name: string,
  state: WorldObject["state"] = {},
): WorldObject {
  return {
    id: `${kind}-1`,
    name,
    kind,
    place: "village",
    pos: { x: 5, y: 6 },
    interactions: config.objects[kind].interactions,
    state,
  };
}
