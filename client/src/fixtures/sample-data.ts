import type {
  Agent,
  LlmCallRecord,
  StreamEntry,
  Moment,
  SnapshotMessage,
  WorldEvent,
} from "@village/shared";

const SAMPLE_WORLD: SnapshotMessage["world"] = {
  agentBody: "person",
  agentHealth: "health.current",
};

/** Plausible sim data for tests and the dev-only mock server. */
export function makeSampleAgent(id: string, name: string, x: number, y: number): Agent {
  return {
    id,
    name,
    pronouns: "",
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
    starvingSinceTick: null,
    bodyChanges: {},
    death: null,
    bodyReplacedById: null,
    bodyHolderId: null,
    mood: "content",
    longTermGoals: [
      { goal: "Sell more bread", reason: "Coins buy ale", progress: "Sold two loaves" },
    ],
    shortTermGoals: [
      {
        goal: "Sell this morning's loaves",
        reason: "The square is busy before noon",
        steps: ["carry the bread to the square", "call out the price"],
        progress: "",
      },
    ],
    intention: "Find someone who wants bread",
    currentAction: { kind: "walk_to", target: "square", endsAtTick: null },
    awareness: {},
    people: {},
    seenPlaces: [],
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
    componentDeclarations: {},
    world: SAMPLE_WORLD,
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
    goal: { goal: "Open a stall", reason: "More buyers", progress: "" },
  };
  const others: Moment[] = [
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

export function makeSampleStreamEntry(label: string, tick: number): StreamEntry {
  return { text: `I saw ${label} at the bakery`, tick };
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
