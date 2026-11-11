import type { Bucket, NeedName, ObjectKind, TraitName, Volume } from "@village/shared";

/**
 * Every tunable value in the sim lives here: rates, caps, weights, loudness, recipes and budgets.
 * Edit and restart to tune. `dailyTokenBudget` can also be changed live from the UI.
 */

export interface InteractionRecipe {
  /** Items consumed from the actor's inventory when the interaction starts. */
  inputs: Record<string, number>;
  /** Items added to the actor's inventory when the interaction finishes. */
  outputs: Record<string, number>;
  /** Units taken from the object's stock when the interaction starts (wheat field, trees). */
  stockUsed: number;
  /** Duration in ticks; null for sleep, which ends by its own rules. */
  ticks: number | null;
  /** Applied to the actor's needs when the interaction finishes. */
  needEffects: Partial<Record<NeedName, number>>;
  /** Sound reach in tiles while the interaction runs; null if silent. */
  loudness: number | null;
  /** Whether the interaction takes words from the decision's `text` field. */
  takesText: boolean;
}

export interface ObjectKindConfig {
  interactions: string[];
  stock?: { capacity: number; regrowPerDay: number };
}

export const config = {
  seed: 20261110,

  clock: {
    minutesPerTick: 1,
    startHour: 6,
    /** Ticks per real second at 1x; 0.8 makes a sim-day take 30 real minutes. */
    baseTicksPerSecond: 0.8,
    speedOptions: [1, 4, 16],
    saveEveryTicks: 60,
  },

  server: {
    defaultPort: 8787,
    defaultDatabasePath: "data/village.db",
    mapPath: "maps/village.json",
    seedsPath: "seeds/agents.json",
    promptsDirectory: "server/prompts",
    recentEventsInSnapshot: 200,
    recentMomentsInSnapshot: 100,
    llmCallsInDetail: 20,
  },

  map: {
    widthTiles: 40,
    heightTiles: 30,
    tileSizePixels: 16,
    defaultOutdoorPlace: "village road",
  },

  perception: {
    sightRangeTiles: 12,
    openTileSoundCost: 1,
    closedDoorSoundCost: 4,
    muffledReachMultiplier: 1.5,
    speechLoudness: { whisper: 2, normal: 8, shout: 20 } satisfies Record<Volume, number>,
    /** Sleepers only hear their own name or sounds at least this loud. */
    sleeperHearingLoudness: 20,
    /** A perception interrupt gives an agent a new decision at most this often. */
    interruptCooldownTicks: 10,
    /** "Around you" lists agents perceived within this many sim-minutes. */
    awarenessPromptWindowMinutes: 60,
    /** Sound fills cached per source tile, door state and reach; the cache clears when full. */
    soundCacheMaxEntries: 512,
  },

  needs: {
    startValue: 0.8,
    decayPerDayAwake: { hunger: 1.0, energy: 0.8, social: 0.8, fun: 0.6 } satisfies Record<
      NeedName,
      number
    >,
    /** Social decay is scaled by 1 + extraversion * this (extraversion is -1..1, so ±50%). */
    socialDecayExtraversionSpread: 0.5,
    /** While asleep, needs other than energy decay at this fraction of their awake rate. */
    sleepDecayMultiplier: 0.25,
    /** Sleep recovery is halved while hunger is below this. */
    sleepHungryThreshold: 0.3,
    sleepRecoveryHungryMultiplier: 0.5,
    /** Sleep ends when hunger drops below this. */
    sleepWakeHungerThreshold: 0.1,
    /** A need crossing below this gives the agent a decision. */
    decisionThreshold: 0.2,
    /** Social gained per line said or heard while taking part in a conversation. */
    socialPerConversationLine: 0.05,
    /** Being among at least this many other agents in sight counts as a crowd. */
    crowdSize: 3,
    /** Per tick in a crowd: extroverts gain social, introverts lose energy; scaled by |extraversion|. */
    crowdSocialGainPerTick: 0.002,
    crowdEnergyCostPerTick: 0.001,
    /** Prompt words for need levels, checked in order: the first whose `below` exceeds the value wins. */
    words: {
      hunger: [
        { below: 0.1, text: "starving" },
        { below: 0.3, text: "very hungry" },
        { below: 0.5, text: "quite hungry" },
        { below: 0.7, text: "a little peckish" },
        { below: Infinity, text: "well fed" },
      ],
      energy: [
        { below: 0.1, text: "exhausted" },
        { below: 0.3, text: "very tired" },
        { below: 0.5, text: "tired" },
        { below: 0.7, text: "a bit tired" },
        { below: Infinity, text: "rested" },
      ],
      social: [
        { below: 0.1, text: "desperately lonely" },
        { below: 0.3, text: "lonely" },
        { below: 0.5, text: "a bit lonely" },
        { below: 0.7, text: "content with company" },
        { below: Infinity, text: "socially fulfilled" },
      ],
      fun: [
        { below: 0.1, text: "miserably bored" },
        { below: 0.3, text: "bored" },
        { below: 0.5, text: "a bit bored" },
        { below: 0.7, text: "fairly entertained" },
        { below: Infinity, text: "having a good time" },
      ],
    } satisfies Record<NeedName, { below: number; text: string }[]>,
  },

  traits: {
    /** Prompt words for trait values (-1..1), checked in order like need words. */
    words: {
      extraversion: [
        "very introverted",
        "quite introverted",
        "balanced between introvert and extrovert",
        "quite extroverted",
        "very extroverted",
      ],
      agreeableness: [
        "very disagreeable",
        "quite disagreeable",
        "moderately agreeable",
        "quite agreeable",
        "very agreeable",
      ],
      conscientiousness: [
        "very careless",
        "quite careless",
        "moderately conscientious",
        "quite conscientious",
        "very conscientious",
      ],
      neuroticism: [
        "very calm",
        "quite calm",
        "moderately anxious",
        "quite anxious",
        "very anxious",
      ],
      openness: [
        "very traditional",
        "quite traditional",
        "moderately curious",
        "quite curious",
        "very curious",
      ],
    } satisfies Record<TraitName, string[]>,
    /** Upper bounds of the bands that select each word above. */
    wordBands: [-0.6, -0.2, 0.2, 0.6, Infinity],
    weeklyDeltaClamp: 0.05,
    min: -1,
    max: 1,
  },

  economy: {
    startingCoins: 30,
    giveReachTiles: 1,
  },

  seeds: {
    /** The usual range for an agent's sleep recovery; the character editor warns outside it. */
    sleepRecoveryRange: { min: 0.12, max: 0.18 },
    /** What a character added in the editor starts with; coins come from `economy.startingCoins`. */
    newAgent: { sleepRecoveryPerHour: 0.15, inventory: { bread: 2 } as Record<string, number> },
    jsonIndent: 2,
  },

  objects: {
    bed: { interactions: ["sleep"] },
    notice_board: { interactions: ["read", "post a note"] },
    bench: { interactions: ["sit"] },
    wheat_field: { interactions: ["harvest wheat"], stock: { capacity: 12, regrowPerDay: 12 } },
    trees: { interactions: ["chop wood"], stock: { capacity: 10, regrowPerDay: 10 } },
    oven: { interactions: ["bake bread"] },
    brew_kettle: { interactions: ["brew ale"] },
    card_table: { interactions: ["play cards"] },
    door: { interactions: ["open", "close"] },
  } satisfies Record<ObjectKind, ObjectKindConfig>,

  /** Interactions on items the agent carries. */
  heldItems: {
    bread: { interactions: ["eat"] },
    ale: { interactions: ["drink"] },
  } as Record<string, { interactions: string[] }>,

  interactions: {
    "harvest wheat": {
      inputs: {},
      outputs: { wheat: 3 },
      stockUsed: 3,
      ticks: 60,
      needEffects: { energy: -0.1 },
      loudness: 4,
      takesText: false,
    },
    "chop wood": {
      inputs: {},
      outputs: { wood: 2 },
      stockUsed: 2,
      ticks: 60,
      needEffects: { energy: -0.15 },
      loudness: 15,
      takesText: false,
    },
    "bake bread": {
      inputs: { wheat: 2, wood: 1 },
      outputs: { bread: 4 },
      stockUsed: 0,
      ticks: 90,
      needEffects: { energy: -0.05 },
      loudness: 3,
      takesText: false,
    },
    "brew ale": {
      inputs: { wheat: 2, wood: 1 },
      outputs: { ale: 6 },
      stockUsed: 0,
      ticks: 120,
      needEffects: { energy: -0.05 },
      loudness: 3,
      takesText: false,
    },
    eat: {
      inputs: { bread: 1 },
      outputs: {},
      stockUsed: 0,
      ticks: 15,
      needEffects: { hunger: 0.5 },
      loudness: null,
      takesText: false,
    },
    drink: {
      inputs: { ale: 1 },
      outputs: {},
      stockUsed: 0,
      ticks: 15,
      needEffects: { fun: 0.3, energy: -0.05 },
      loudness: null,
      takesText: false,
    },
    "play cards": {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 30,
      needEffects: { fun: 0.2 },
      loudness: 6,
      takesText: false,
    },
    sit: {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 20,
      needEffects: { energy: 0.1 },
      loudness: null,
      takesText: false,
    },
    sleep: {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: null,
      needEffects: {},
      loudness: null,
      takesText: false,
    },
    read: {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 5,
      needEffects: {},
      loudness: null,
      takesText: false,
    },
    "post a note": {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 5,
      needEffects: {},
      loudness: null,
      takesText: true,
    },
    open: {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 1,
      needEffects: {},
      loudness: 3,
      takesText: false,
    },
    close: {
      inputs: {},
      outputs: {},
      stockUsed: 0,
      ticks: 1,
      needEffects: {},
      loudness: 3,
      takesText: false,
    },
  } satisfies Record<string, InteractionRecipe> as Record<string, InteractionRecipe>,

  /**
   * How each interaction reads in events, awareness and prompts. `{target}` is the object or held
   * item. `ongoing` follows "started ..." and describes the running action; `done` is the
   * finished act; `attempt` follows "I tried to ..." when it fails.
   */
  interactionPhrases: {
    "harvest wheat": {
      ongoing: "harvesting wheat at the {target}",
      done: "harvested wheat",
      attempt: "harvest wheat at the {target}",
    },
    "chop wood": {
      ongoing: "chopping wood at the {target}",
      done: "chopped wood",
      attempt: "chop wood at the {target}",
    },
    "bake bread": {
      ongoing: "baking bread at the {target}",
      done: "baked bread",
      attempt: "bake bread at the {target}",
    },
    "brew ale": {
      ongoing: "brewing ale at the {target}",
      done: "brewed ale",
      attempt: "brew ale at the {target}",
    },
    eat: {
      ongoing: "eating {target}",
      done: "ate {target}",
      attempt: "eat {target}",
    },
    drink: {
      ongoing: "drinking {target}",
      done: "drank {target}",
      attempt: "drink {target}",
    },
    "play cards": {
      ongoing: "playing cards at the {target}",
      done: "played cards",
      attempt: "play cards at the {target}",
    },
    sit: {
      ongoing: "sitting on the {target}",
      done: "sat on the {target}",
      attempt: "sit on the {target}",
    },
    sleep: {
      ongoing: "sleeping in the {target}",
      done: "slept in the {target}",
      attempt: "sleep in the {target}",
    },
    read: {
      ongoing: "reading the {target}",
      done: "read the {target}",
      attempt: "read the {target}",
    },
    "post a note": {
      ongoing: "posting a note on the {target}",
      done: "posted a note",
      attempt: "post a note on the {target}",
    },
    open: {
      ongoing: "opening the {target}",
      done: "opened the {target}",
      attempt: "open the {target}",
    },
    close: {
      ongoing: "closing the {target}",
      done: "closed the {target}",
      attempt: "close the {target}",
    },
  } as Record<string, { ongoing: string; done: string; attempt: string }>,

  playCards: { funPerOtherPlayer: 0.1 },

  noticeBoard: { notesShownOnRead: 5, maxNoteChars: 200, maxNotesKept: 30 },

  memory: {
    maxMemoryChars: 200,
    bucketCap: 60,
    deleteBelowStrength: 0.05,
    halfLifeHours: {
      seen: 12,
      overheard: 12,
      conversations: 24,
      did: 24,
      places: 72,
      people: 168,
      reflections: 168,
    } satisfies Record<Bucket, number>,
    recallPerBucket: {
      people: 3,
      conversations: 5,
      seen: 3,
      overheard: 2,
      did: 3,
      places: 2,
      reflections: 2,
    } satisfies Record<Bucket, number>,
    scoreWeights: { tagOverlap: 1.0, recency: 0.5, strength: 0.5, similarity: 0 },
    recencyHalfLifeHours: 6,
    associationSeedCount: 3,
    associationPerBucket: 2,
    recallBump: 0.2,
    recallBumpCooldownHours: 1,
    /** Skip filing when the same actor did the same thing within this many ticks. */
    duplicateWindowTicks: 30,
    /** An agent takes part in a conversation if it spoke within earshot of the speaker this recently. */
    participationWindowTicks: 10,
    workingMemorySize: 8,
    /** Memories fade (applyForgetting) every this many ticks; bucket caps are enforced every tick. */
    forgettingEveryTicks: 60,
    recallActionResultLimit: 6,
    reflectionInsightStrength: 1.0,
    newMemoryStrength: 1.0,
  },

  decision: {
    conversationLines: 12,
    conversationWindowTicks: 30,
    promptTokenTarget: 3000,
    /** Rough characters-per-token used to estimate prompt size before trimming memories. */
    charsPerToken: 4,
    defaultWaitMinutes: 10,
    maxWaitMinutes: 240,
    /** Recalled memories are trimmed from these buckets first (oldest first) when over the token target. */
    memoryTrimOrder: [
      "seen",
      "overheard",
      "places",
      "did",
      "reflections",
      "conversations",
      "people",
    ] satisfies Bucket[] as Bucket[],
  },

  llm: {
    concurrency: 8,
    retryBackoffMs: 1500,
    requestTimeoutMs: 60000,
    /** null sends no temperature, so the provider default applies; Anthropic rejects any other value. */
    temperature: null as number | null,
    /**
     * Ceilings, not targets: only generated tokens are billed. Some models tokenize JSON at barely
     * over one character per token, so a full decision reply can need several hundred tokens.
     */
    maxReplyTokens: { decision: 1500, interact: 500, morning: 1500, night: 3000, weekly: 3000 },
    dailyTokenBudget: 10_000_000,
    /** One first try plus one retry on invalid output or an API error. */
    attemptsPerCall: 2,
    /** How much of a failed HTTP response body is kept in the error message. */
    errorBodyPreviewChars: 500,
    /** Sent as OpenRouter's X-Title header; a generic app name, never personal details. */
    appTitle: "Village Sim",
    /** The offline `LLM_PROVIDER=fake` responder: seeded, and weights for the actions it picks. */
    fakeResponder: {
      seed: 7,
      actionWeights: { walk_to: 3, interact: 4, wait: 2, give: 0.5, recall: 0.5 },
      continueChance: 0.5,
      sayChance: 0.3,
      omitInteractionChance: 0.25,
      waitMinutes: { min: 5, max: 30 },
      lines: [
        "Good morning!",
        "Fine weather today.",
        "Anyone need bread?",
        "I could use some wheat.",
        "How are you keeping?",
        "I'll pay two coins for that.",
      ],
    },
  },

  reflection: {
    morningMinSleepHours: 4,
    nightCooldownHours: 16,
    nightForcedHour: 2,
    maxInsights: 3,
    weeklyEveryNights: 7,
    daySummariesShownWeekly: 7,
    /** The night pass shows the agent's memories from this many sim-hours back. */
    nightMemoryWindowHours: 24,
    /** At most this many of the day's memories (strongest, then newest) reach the night prompt. */
    nightMemoriesShown: 40,
    /** The night prompt shows up to this many current notes for each person met today. */
    peopleNotesShownPerPerson: 3,
    /** Trait values are rounded to this many decimals after a weekly change. */
    traitValueDecimals: 3,
  },
};

export type Config = typeof config;
