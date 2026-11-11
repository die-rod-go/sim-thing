import type {
  Agent,
  LlmCallRecord,
  Memory,
  Moment,
  SnapshotMessage,
  WorldEvent,
} from "@village/shared";

/** Plausible sim data for tests and the dev-only mock server. */
export function makeSampleAgent(id: string, name: string, x: number, y: number): Agent {
  return {
    id,
    name,
    place: "square",
    pos: { x, y },
    personality: {
      traits: {
        extraversion: 0.4,
        agreeableness: 0.2,
        conscientiousness: -0.1,
        neuroticism: -0.3,
        openness: 0.6,
      },
      core: `${name} is curious and talks a lot.`,
      selfImage: `${name} thinks of themself as a good neighbor.`,
    },
    body: { sleepRecoveryPerHour: 0.15, strength: 0.5, agility: 0.5 },
    profession: "baker",
    needs: { hunger: 0.7, energy: 0.5, social: 0.3, fun: 0.9 },
    health: 1,
    starvingSinceTick: null,
    conditions: [],
    death: null,
    mood: "content",
    goals: [
      {
        text: "Sell more bread",
        why: "Coins buy ale",
        progress: "Sold two loaves",
        kind: "world",
      },
    ],
    dailyPlan: "Bake in the morning, sell at the square, tavern in the evening.",
    intention: "Find someone who wants bread",
    currentAction: { kind: "walk_to", target: "square", endsAtTick: null },
    workingMemory: [],
    awareness: {},
    lastThought: { text: `${name} wonders whether anyone wants bread today.`, tick: 28 },
  };
}

export function makeSampleSnapshot(agents: Agent[]): SnapshotMessage {
  return {
    type: "snapshot",
    clock: { tick: 30, isPaused: false, speed: 1 },
    stats: {
      inFlightLlmCalls: 1,
      tokensToday: 12_345,
      dailyTokenBudget: 2_000_000,
      isOverBudget: false,
    },
    timeSettings: { minutesPerTick: 1, startHour: 6 },
    baseTicksPerSecond: 0.8,
    speedOptions: [1, 4, 16],
    agents,
    entities: [],
    itemDefinitions: [],
    recentEvents: [],
    recentMoments: [],
  };
}

export function makeSampleEvent(id: number, actor: Agent, tick: number): WorldEvent {
  return {
    id,
    tick,
    actorId: actor.id,
    actorName: actor.name,
    kind: "said",
    targetId: null,
    targetName: null,
    place: actor.place,
    pos: actor.pos,
    description: `said "Fresh bread here!"`,
    loudness: 8,
    speech: {
      words: "Fresh bread here!",
      volume: "normal",
      thought: "If I shout it, someone hungry will come over.",
      llmCallId: id,
    },
  };
}

/** One of a few plausible moments, picked by `id`. */
export function makeSampleMoment(id: number, actor: Agent, tick: number): Moment {
  const base = { id, tick, agentId: actor.id, agentName: actor.name };
  const goalMoment: Moment = {
    ...base,
    kind: "goal_added",
    text: "set a new goal: open a stall",
    goal: { text: "Open a stall", why: "More buyers", progress: "", kind: "world" },
  };
  const others: Moment[] = [
    {
      ...base,
      kind: "daily_plan",
      text: "planned the day: bake early, sell at the square",
      plan: "Bake early, sell at the square, rest by the well.",
    },
    {
      ...base,
      kind: "reflection",
      text: "looked back on the day: a busy day of baking",
      pass: "night",
      summary: "A busy day of baking; Bob was short with me.",
      moodEntry: "tired but proud",
      insights: ["Bob is grumpy before noon"],
    },
    {
      ...base,
      kind: "personality_changed",
      text: "openness rose from 0.6 to 0.65",
      field: "openness",
      oldValue: "0.6",
      newValue: "0.65",
      reason: "trying new recipes went well",
    },
  ];
  const samples = [goalMoment, ...others];
  return samples[id % samples.length] ?? goalMoment;
}

export function makeSampleMemory(id: string, agentId: string, tick: number): Memory {
  return {
    id,
    agentId,
    bucket: id.endsWith("1") ? "seen" : "conversations",
    tick,
    text: `Memory ${id} about the bakery`,
    tags: ["bakery", "bread"],
    strength: 0.6,
    lastRecalledTick: null,
  };
}

export const SAMPLE_PROMPT = [
  "You are Ada, a baker in a small village.",
  "## Needs",
  "hunger 0.7, energy 0.5",
  "## Around you",
  "Bob is at the square, chopping wood.",
  "## Memories: seen",
  "- You saw Bob at the tavern last night.",
].join("\n");

export function makeSampleLlmCall(id: number, agentId: string, tick: number): LlmCallRecord {
  return {
    id,
    agentId,
    tick,
    kind: "decision",
    model: "fake/model",
    prompt: SAMPLE_PROMPT,
    reply: '{"thought":"I should sell bread","intention":"Sell bread","action":"wait"}',
    parsed: { thought: "I should sell bread", intention: "Sell bread", action: "wait" },
    promptTokens: 812,
    completionTokens: 64,
    latencyMs: 930,
    error: null,
  };
}
