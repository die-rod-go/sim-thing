import type { Bucket, LlmCallKind, NeedName, StatName, TraitName, Volume } from "@village/shared";

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
    sightRangeTiles: 24,
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
    /** How what a thing holds reads, once the agent can see inside it. */
    contentsWords: { holding: "holding {items}" },
    /** An agent sees what is directly inside a thing within this many tiles of it. */
    contentsReachTiles: 1,
    /** Sound fills cached per source tile, muffling state and reach; the cache clears when full. */
    soundCacheMaxEntries: 512,
  },

  needs: {
    startValue: 0.8,
    decayPerDayAwake: { hunger: 0.25, energy: 0.8, social: 0.8, fun: 0.6 } satisfies Record<
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
          urge: "you can barely keep your eyes open and need to find a bed to sleep",
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
    /** Added to a rule's killed phrase when an agent is behind it. */
    causedBySuffix: " after being hurt by {actor}",
  },

  rules: {
    /** How deep a chain of rules setting off rules may go before the rest are dropped. */
    maxDepth: 8,
  },

  steps: {
    /** The event a `sound` step makes; its subject is the thing or agent the sound comes from. */
    soundDescription: "made a loud noise",
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
    /** The event for damage that isn't an attack. Its subject is the actor. */
    hurtDescription: "was hurt",
    /** What onlookers learn of a failed attempt, without the actor's private reason. `{attempt}` is the act. */
    failedAttemptDescription: "tried to {attempt}, but it didn't happen",
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
    /** The extra choice in the "which verb" follow-up for doing none of them. */
    declineVerbName: "never mind",
    /** How `{target}` reads when the agent aims a verb at itself: to others, and in its own memory. */
    selfTargetWords: { others: "themselves", own: "myself" },
    /** How `{target}` reads in the target's own memory ("Tobias hit me"). */
    targetOwnWord: "me",
    /** After a carried tool's verbs: what it lets the agent do here. `{uses}` lists the phrases. */
    toolUsesWords: "lets you {uses}",
    /** The longest `choice.text` a verb gets (a note's words); longer text is cut. */
    maxTextChars: 200,
  },

  reading: {
    /** A `read` step reads the newest this many things inside what is read (notes on a board). */
    thingsShownOnRead: 5,
    /**
     * The `seen` memory of one text read. `{thing}` is what bore it ("note"), `{holder}` what that
     * was inside, `{author}` who wrote it, when the step names an author field.
     */
    memories: {
      withAuthorAndHolder: 'I read a {thing} from {author} on the {holder}: "{text}"',
      withAuthor: 'I read a {thing} from {author}: "{text}"',
      withHolder: 'I read a {thing} on the {holder}: "{text}"',
      plain: 'I read a {thing}: "{text}"',
    },
    /** Remembered briefly when there was no text to read. */
    nothingToRead: "There was nothing to read on the {thing}",
  },

  walking: {
    /** A walker whose way stays blocked by other agents this many ticks gives up the walk. */
    blockedGiveUpTicks: 5,
    /** Walkers arriving at an indoor place stop at least this many steps from its doorways. */
    arrivalDoorwayClearanceTiles: 2,
    blockedReason: "{agent} was in the way",
  },

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
      reflections: 168,
    } satisfies Record<Bucket, number>,
    recallPerBucket: {
      conversations: 3,
      seen: 3,
      overheard: 2,
      did: 3,
      places: 1,
      reflections: 3,
    } satisfies Record<Bucket, number>,
    /** After the per-bucket picks, only this many best-scoring memories are kept. */
    recallTotal: 10,
    scoreWeights: { tagOverlap: 1.0, recency: 0.3, strength: 0.3, similarity: 1.0 },
    recencyHalfLifeHours: 6,
    associationSeedCount: 3,
    associationTotal: 3,
    /** Lexical similarity between a cue or query and a memory's words. */
    similarity: {
      minWordLength: 3,
      /** A suffix is stripped only if at least this many letters remain. */
      minStemLength: 3,
      stemSuffixes: ["ing", "ed", "es", "s"],
      stopWords: [
        "the",
        "and",
        "but",
        "for",
        "nor",
        "yet",
        "with",
        "from",
        "into",
        "onto",
        "that",
        "this",
        "these",
        "those",
        "then",
        "than",
        "there",
        "here",
        "what",
        "when",
        "where",
        "which",
        "who",
        "whom",
        "whose",
        "why",
        "how",
        "are",
        "was",
        "were",
        "been",
        "being",
        "have",
        "has",
        "had",
        "does",
        "did",
        "doing",
        "will",
        "would",
        "could",
        "should",
        "can",
        "may",
        "might",
        "must",
        "not",
        "you",
        "your",
        "yours",
        "his",
        "her",
        "hers",
        "its",
        "our",
        "ours",
        "their",
        "theirs",
        "him",
        "she",
        "they",
        "them",
        "myself",
        "about",
        "just",
        "very",
        "some",
        "any",
        "all",
        "out",
        "off",
        "over",
        "under",
        "again",
        "once",
        "too",
        "also",
        "get",
        "got",
        "let",
        "say",
        "said",
      ],
    },
    /** The `recall` action also returns memories with at least this lexical similarity to the query. */
    recallActionMinSimilarity: 0.2,
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
    /** How many of the current conversation's last lines go into the recall cue text. */
    cueConversationLines: 3,
    reflectionInsightStrength: 1.0,
    newMemoryStrength: 1.0,
    /**
     * When a conversation ends, each participant's line memories from it are replaced by one
     * summary the agent writes. Lines summarised early when a conversation runs long.
     */
    conversationSummary: {
      endAfterQuietTicks: 15,
      maxLinesPerSummary: 30,
      maxChars: 500,
      retryAfterTicks: 30,
      /** The agent's own `did` and `seen` memories from the conversation's span shown to the summary. */
      meanwhileMemoriesShown: 12,
    },
  },

  /** One rewritable text per known person, kept by each agent. */
  plans: {
    maxPlans: 3,
    maxSteps: 5,
    maxAimChars: 200,
    maxStepChars: 200,
    maxKeepFromChars: 200,
  },

  dossier: {
    /** The length a rewritten entry is asked to keep to; see `llm.replyTextSlack`. */
    maxChars: 400,
    /** The decision prompt's "People on your mind" lists at most this many. */
    shownInDecision: 5,
    /** Shown for a person in sight or in the conversation whom the agent has no entry for. */
    unknownPersonText: "nothing known yet beyond what you see.",
    /** The decision section's text when no one is on the agent's mind. */
    nobodyOnMindText: "No one in particular.",
    /** Shown in a reflection prompt for a person the agent has no entry for. */
    reflectionUnknownPersonText: "nothing written down about them yet.",
  },

  decision: {
    /**
     * The running sim lets the clock go on while an agent interrupted mid-action decides and while
     * conversation summaries and reflection passes run; idle agents' decisions still hold it.
     * Tests always wait for every call.
     */
    shouldCallLlmInBackground: true,
    /**
     * Longest an idle agent's decision holds the clock in real time; past it the tick goes on and
     * the plan lands on a later tick, so one slow call can't stall the village.
     */
    idleDecisionWaitMs: 1500,
    conversationLines: 12,
    conversationWindowTicks: 30,
    /** Sized so a typical prompt keeps its recalled memories; only unusually long ones get trimmed. */
    promptTokenTarget: 4500,
    /** Rough characters-per-token used to estimate prompt size before trimming memories. Measured from logged Haiku calls: about 1.9. */
    charsPerToken: 2,
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
    ] satisfies Bucket[] as Bucket[],
  },

  llm: {
    concurrency: 8,
    retryBackoffMs: 1500,
    requestTimeoutMs: 15000,
    /** Anthropic's native API: the required version header and the cache lifetime of each breakpoint. */
    anthropicVersion: "2023-06-01",
    anthropicCacheType: "ephemeral",
    /**
     * Written text may run this much over the length a prompt asks for before the reply is
     * rejected: models can't count characters, and a retry costs a whole second call.
     */
    replyTextSlack: 1.5,
    /** null sends no temperature, so the provider default applies; Anthropic rejects any other value. */
    temperature: null as number | null,
    /**
     * Ceilings, not targets: only generated tokens are billed. Some models tokenize JSON at barely
     * over one character per token, so a full decision reply can need several hundred tokens.
     */
    maxReplyTokens: {
      decision: 1500,
      interact: 500,
      morning: 3000,
      daytime: 3000,
      night: 4500,
      weekly: 3000,
      conversation_summary: 2000,
    },
    /** Calls of these kinds use `LLM_REFLECTION_MODEL` when it is set. */
    reflectionKinds: ["morning", "daytime", "night", "weekly"] as LlmCallKind[],
    dailyTokenBudget: 100_000_000,
    /**
     * Tries per call, the first included. A rejected reply (bad JSON, failed validation, too long)
     * is retried with the error added to the prompt; after the last try the caller falls back.
     */
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
      /** Chance a verb used with a carried item is also aimed at something here or at itself. */
      aimChance: 0.5,
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
    /** The daytime pass files at most this many insights. */
    daytimeMaxInsights: 2,
    /** The morning and daytime prompts show at most this many dossiers (people in the memories, then people named in goals and plans). */
    dossiersShown: 6,
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
    /** Trait values are rounded to this many decimals after a weekly change. */
    traitValueDecimals: 3,
  },
};

export type Config = typeof config;
