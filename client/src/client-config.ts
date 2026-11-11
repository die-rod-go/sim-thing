/** Tunable values for the browser client. Sim tunables live in the server config. */
export const clientConfig = {
  connection: {
    path: "/ws",
    initialReconnectDelayMs: 500,
    maxReconnectDelayMs: 10_000,
    reconnectBackoffFactor: 2,
  },

  state: {
    maxFeedEvents: 500,
    maxSpeechBubblesPerAgent: 3,
  },

  map: {
    mapUrl: "/village.json",
    tilesetUrl: "/tileset.png",
    requiredLayers: ["ground", "walls"],
    optionalLayers: ["decor"],
  },

  village: {
    /** Upper bound on a one-tile move tween so slow speeds don't make agents lag behind. */
    maxMoveTweenMs: 1000,
    speechBubbleLifetimeMs: 8000,
    speechBubbleFadeMs: 1500,
    speechBubbleWrapWidth: 110,
    speechBubbleGap: 2,
    speechBubbleLeaderLineWidth: 1,
    speechBubbleLeaderLineAlpha: 0.6,
    selectionRingRadius: 8,
    visibleTileAlpha: 0.28,
    speechReachLineWidth: 1,
  },

  ui: {
    maxPersonalityHistoryShown: 50,
    maxRecentLinesShown: 4,
    maxPersonNotesShown: 3,
    maxTagChips: 30,
  },

  characterEditor: {
    traitStep: 0.05,
    sleepRecoveryStep: 0.01,
    defaultTextAreaRows: 2,
    coreTextAreaRows: 5,
  },

  conversations: {
    /** A line more than this many ticks after the previous one at the same place opens a new thread. */
    maxGapTicks: 10,
  },

  /** Words for need levels, from worst to best; `upperBounds` splits 0–1 into those levels. */
  needLevels: {
    upperBounds: [0.15, 0.35, 0.55, 0.8],
    /** Levels at or below this index are flagged in the roster. */
    alertLevelIndex: 1,
    words: {
      hunger: ["starving", "hungry", "peckish", "fed", "full"],
      energy: ["exhausted", "tired", "drowsy", "rested", "lively"],
      social: ["desperately lonely", "lonely", "could use company", "connected", "fulfilled"],
      fun: ["miserably bored", "bored", "restless", "entertained", "delighted"],
    },
  },

  /** Words for each trait's low and high end, and how far from 0 each intensity starts. */
  traitWords: {
    balancedBelow: 0.15,
    strongFrom: 0.4,
    extremeFrom: 0.7,
    poles: {
      extraversion: ["reserved", "outgoing"],
      agreeableness: ["prickly", "warm"],
      conscientiousness: ["careless", "diligent"],
      neuroticism: ["calm", "anxious"],
      openness: ["conventional", "curious"],
    },
  },
} as const;
