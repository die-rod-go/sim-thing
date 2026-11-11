import type {
  Bucket,
  NeedName,
  StatName,
  TraitName,
  Volume,
  WorldEventKind,
} from "@village/shared";

/**
 * Every global tunable in the sim lives here: rates, caps, weights, loudness and budgets. Item
 * content (definitions, verbs and their numbers) lives in `seeds/items.json`. Edit and restart to
 * tune. `dailyTokenBudget` can also be changed live from the UI.
 */

export interface NeedWord {
  below: number;
  text: string;
  /** What a pressing need feels like; only the low levels have one. */
  urge?: string;
  /** Extra share of time a verb takes at this level (0.5 = half as long again). */
  slowdown?: number;
  /** Chance, per decision, that recall fails at this level. */
  recallFailureChance?: number;
}

/** A health level: what the agent feels about itself, and what others see once it shows. */
export interface HealthWord {
  below: number;
  text: string;
  /** What others in sight see; only shown below `health.visibleToOthersBelow`. */
  looks: string;
  /** What a serious wound feels like; a level with one is put first in the prompt, like a need. */
  urge?: string;
  /** Extra share of time a verb takes at this level, as for needs. */
  slowdown?: number;
  /** Chance, per decision, that recall fails at this level, as for needs. */
  recallFailureChance?: number;
}

export const config = {
  seed: 20261110,

  clock: {
    minutesPerTick: 1,
    startHour: 6,
    /** Ticks per real second at 1x; 0.8 makes a sim-day take 30 real minutes. */
    baseTicksPerSecond: 1.6,
    speedOptions: [1, 4, 16],
    saveEveryTicks: 60,
  },

  server: {
    defaultPort: 8787,
    defaultDatabasePath: "data/village.db",
    mapPath: "maps/village.json",
    seedsPath: "seeds/agents.json",
    itemsPath: "seeds/items.json",
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
    /** How an item on the ground reads in Here, indoors and out ("a knife (pick up; on the floor)"). */
    groundWords: { indoor: "on the floor", outdoor: "on the ground" },
    /** How what a container or body holds reads, once within reach of a verb that takes from it. */
    contentsWords: { holding: "holding {items}", empty: "empty" },
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
    /**
     * Prompt words for need levels, checked in order: the first whose `below` exceeds the value wins.
     * A level with an `urge` is pressing: it is put first in the prompt as its own sentence.
     */
    words: {
      hunger: [
        {
          below: 0.1,
          text: "starving",
          urge: "you feel weak and shaky and need food now",
          slowdown: 0.5,
          recallFailureChance: 0.3,
        },
        {
          below: 0.3,
          text: "very hungry",
          urge: "your stomach aches and you need to eat soon",
          slowdown: 0.2,
          recallFailureChance: 0.1,
        },
        { below: 0.5, text: "quite hungry" },
        { below: 0.7, text: "a little peckish" },
        { below: Infinity, text: "well fed" },
      ],
      energy: [
        {
          below: 0.1,
          text: "exhausted",
          urge: "you can barely keep your eyes open and need to sleep now",
          slowdown: 0.6,
          recallFailureChance: 0.35,
        },
        {
          below: 0.3,
          text: "very tired",
          urge: "your body is heavy and you need sleep soon",
          slowdown: 0.3,
          recallFailureChance: 0.15,
        },
        { below: 0.5, text: "tired" },
        { below: 0.7, text: "a bit tired" },
        { below: Infinity, text: "rested" },
      ],
      social: [
        {
          below: 0.1,
          text: "desperately lonely",
          urge: "you ache for real company",
          slowdown: 0.1,
          recallFailureChance: 0.1,
        },
        {
          below: 0.3,
          text: "lonely",
          urge: "you want someone to really talk to",
          recallFailureChance: 0.05,
        },
        { below: 0.5, text: "a bit lonely" },
        { below: 0.7, text: "content with company" },
        { below: Infinity, text: "socially fulfilled" },
      ],
      fun: [
        {
          below: 0.1,
          text: "miserably bored",
          urge: "you badly need something enjoyable to do",
          slowdown: 0.1,
          recallFailureChance: 0.05,
        },
        { below: 0.3, text: "bored", urge: "you want something enjoyable to do" },
        { below: 0.5, text: "a bit bored" },
        { below: 0.7, text: "fairly entertained" },
        { below: Infinity, text: "having a good time" },
      ],
    } satisfies Record<NeedName, NeedWord[]>,
  },

  /**
   * How pressing needs and wounds get in the way, using the `slowdown` and `recallFailureChance` of
   * each level above. `{status}` becomes the words for what is getting in the way.
   */
  impairment: {
    slowStartText: "This will take longer than usual because I'm {status}",
    slowOngoingText: "slow going because you are {status}",
    slowFinishText: "slowly, because I was {status}",
    recallFailedText: `I tried to recall "{query}" but couldn't think straight because I'm {status}`,
    foggyMindText: "Your thoughts are foggy because you are {status}; little comes to mind.",
  },

  health: {
    startValue: 1,
    /** Hours of hunger at 0 before starvation starts to do damage. */
    starvationGraceHours: 12,
    starvationDrainPerHour: 0.1,
    /** Shown to the viewer as the cause of death; agents only learn it by witnessing. */
    starvationKilledPhrase: "starved",
    /** What a sleeper woken by damage knows: they were hurt, not by what. */
    wokeInPainText: "I woke up in pain",
    regenPerHourAwake: 0.01,
    regenPerHourAsleep: 0.04,
    /** Health regenerates only while hunger is above this. */
    regenHungerThreshold: 0.4,
    /** Health crossing below any of these gives the agent a decision. */
    decisionThresholds: [0.5, 0.25],
    /** Others see an agent's health as words only once it drops below this. */
    visibleToOthersBelow: 0.9,
    /** Checked in order like need words: the first whose `below` exceeds the value wins. */
    words: [
      {
        below: 0.15,
        text: "near death",
        looks: "looks near death",
        urge: "you can barely stand and feel your life slipping away",
        slowdown: 0.8,
        recallFailureChance: 0.3,
      },
      {
        below: 0.35,
        text: "badly wounded",
        looks: "looks badly wounded",
        urge: "your wounds throb and you feel faint",
        slowdown: 0.4,
        recallFailureChance: 0.1,
      },
      { below: 0.6, text: "hurt", looks: "looks hurt" },
      { below: 0.9, text: "bruised", looks: "looks bruised" },
      { below: Infinity, text: "unhurt", looks: "looks unhurt" },
    ] satisfies HealthWord[] as HealthWord[],
  },

  stats: {
    min: 0,
    max: 1,
    /** Prompt words for the agent's own stats, picked by `wordBands` like trait words. */
    words: {
      strength: ["very weak", "rather weak", "of average strength", "quite strong", "very strong"],
      agility: [
        "very clumsy",
        "rather clumsy",
        "of average agility",
        "quite nimble",
        "very nimble",
      ],
    } satisfies Record<StatName, string[]>,
    /** Upper bounds of the bands that select each word above. */
    wordBands: [0.2, 0.4, 0.6, 0.8, Infinity],
  },

  death: {
    /** How others see a dead agent, in prompts and as a walk target. */
    bodyName: "{name}'s body",
    /** What awareness records a dead agent as doing. */
    doing: "lying dead",
    /** The `died` event's description; its subject is the dead agent. */
    eventDescription: "died",
    /** Fills `{actor}` in a killed phrase when no agent did the damage. */
    unknownSource: "someone",
  },

  conditions: {
    /** Event phrases for a condition that leaves them out of `items.json`; `{words}` is its words. */
    defaultStartedPhrase: "became {words}",
    defaultEndedPhrase: "was no longer {words}",
    /** Added to a condition's or reaction's killed phrase when an agent caused it. */
    causedBySuffix: " after being hurt by {actor}",
    /** Conditions whose start and end are their own event kinds; the rest use condition_started/ended. */
    eventKinds: {
      burning: { started: "caught_fire", ended: "stopped_burning" },
    } as Record<string, { started: WorldEventKind; ended: WorldEventKind }>,
  },

  reactions: {
    /** How many reactions one stimulus may set off in a chain before the rest are dropped. */
    maxDepth: 8,
  },

  effects: {
    /** The event a `make_sound` effect makes; its subject is the thing or agent the sound comes from. */
    soundDescription: "made a loud noise",
    /** The event for a thing a condition or reaction broke or transformed ("the jar broke"). */
    thingBrokeDescription: "broke",
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
    /** The money item. Nothing makes or destroys it, so the supply is closed. */
    currencyDefinitionId: "coin",
    giveReachTiles: 1,
  },

  seeds: {
    /** The usual range for an agent's sleep recovery; the character editor warns outside it. */
    sleepRecoveryRange: { min: 0.12, max: 0.18 },
    /** What a character added in the editor starts with; the inventory is by definition id. */
    newAgent: {
      sleepRecoveryPerHour: 0.15,
      strength: 0.5,
      agility: 0.5,
      inventory: { coin: 30, bread: 2 } as Record<string, number>,
    },
    jsonIndent: 2,
  },

  combat: {
    /** Each point of agility the attacker has over the defender adds this much hit chance. */
    agilitySpread: 0.5,
    minHitChance: 0.1,
    maxHitChance: 0.95,
    /** Strength-scaled damage is multiplied by 1 + (strength - midpoint) * spread. */
    strengthSpread: 0.6,
    strengthMidpoint: 0.5,
    /** Ticks an agent keeps following a moving target, beyond the first path there, before giving up. */
    chaseTicks: 10,
    /** Events for damage that isn't an attack, and for something breaking. Their subject is the actor. */
    hurtDescription: "was hurt",
    brokePhrase: "broke the {target}",
  },

  verbs: {
    /**
     * Phrases for a verb that leaves some out of `items.json`. `{verb}` is the verb's name and
     * `{item}` the thing used.
     */
    defaultPhrases: {
      ongoing: "using the {item} ({verb})",
      done: "used the {item} ({verb})",
      attempt: "{verb} the {item}",
      hit: "{verb} {target}",
      missed: "tried to {verb} {target} and missed",
      killed: "killed by {actor}",
    },
    /** What a decision names to aim a verb at oneself ("bandage yourself"). */
    selfTargetName: "yourself",
    /** How `{target}` reads when the agent aims a verb at itself: to others, and in its own memory. */
    selfTargetWords: { others: "themselves", own: "myself" },
    /** How `{target}` reads in the target's own memory ("Tobias hit me"). */
    targetOwnWord: "me",
    /** What a thrown thing receives where it lands, hit or miss. */
    landingStimulus: "impact",
    /**
     * How moving things reads, by the event it makes. `{items}` is what moved ("2 bread"),
     * `{holder}` the container or body, `{target}` what it was thrown at.
     */
    movePhrases: {
      dropped: "dropped {items}",
      picked_up: "picked up {items}",
      put: "put {items} in {holder}",
      took: "took {items} from {holder}",
      threw: "threw {items} at {target}",
    },
    /** Why nothing can be taken from a living agent: only they can hand it over. */
    livingHolderReason: "{name} is alive, and only they can hand over what they carry",
  },

  doors: {
    /** Walking into a closed door opens it in passing. */
    openedInPassingLoudness: 3,
    openedInPassingPhrase: "opened the {item}",
  },

  noticeBoard: { notesShownOnRead: 5, maxNoteChars: 200 },

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
    /**
     * When a conversation ends, each participant's line memories from it are replaced by one
     * summary the agent writes. Lines summarised early when a conversation runs long.
     */
    conversationSummary: {
      endAfterQuietTicks: 15,
      maxLinesPerSummary: 30,
      maxChars: 320,
      retryAfterTicks: 30,
    },
  },

  decision: {
    /** The running sim lets the clock go on while decisions wait for the LLM; tests always wait. */
    shouldDecideInBackground: true,
    conversationLines: 12,
    conversationWindowTicks: 30,
    promptTokenTarget: 3000,
    /** Rough characters-per-token used to estimate prompt size before trimming memories. */
    charsPerToken: 4,
    defaultWaitMinutes: 10,
    /** How long a speaker stays to hear an answer when the reply names no minutes. */
    sayWaitMinutes: 5,
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
    maxReplyTokens: {
      decision: 1500,
      interact: 500,
      morning: 1500,
      daytime: 1500,
      night: 3000,
      weekly: 3000,
      conversation_summary: 1000,
    },
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
      actionWeights: { walk_to: 3, interact: 4, say: 2, wait: 2, give: 0.5, recall: 0.5 },
      /** Verbs with a hit roll are picked this rarely, so soak runs see fights without a massacre. */
      attackWeight: 0.05,
      continueChance: 0.5,
      omitVerbChance: 0.25,
      /** A carried item with this verb is eaten whenever the status line holds a hungry word. */
      eatVerb: "eat",
      /** Verbs that move what `item` names, and where that comes from: carried, or inside the thing. */
      itemChoosingVerbs: { put: "carried", take: "inside" } as Record<string, "carried" | "inside">,
      hungryWords: ["starving", "very hungry", "quite hungry"],
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
    /** An awake agent thinks things over (the daytime pass) this many sim-hours after its last reflection. */
    daytimeEveryHours: 2,
    /** At most this many memories since the last reflection (strongest, then newest) reach the daytime prompt. */
    daytimeMemoriesShown: 25,
    /** The daytime prompt shows this many of the agent's newest insights, so it builds on them. */
    daytimeEarlierInsightsShown: 4,
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
