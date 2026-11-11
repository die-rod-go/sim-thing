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
    /** Bubble sizes, gaps and offsets below are in screen pixels; bubbles don't scale with zoom. */
    speechBubbleLifetimeMs: 8000,
    speechBubbleFadeMs: 1500,
    speechBubbleWrapWidth: 240,
    speechBubbleGap: 4,
    speechBubbleLeaderLineWidth: 1,
    speechBubbleLeaderLineAlpha: 0.6,
    /** Space between the top of a figure and the bottom of its bubble stack. */
    speechBubbleOffsetAboveFigure: 14,
    /** In map pixels, scaled with the figure. */
    selectionRingRadius: 9,
    visibleTileAlpha: 0.28,
    speechReachLineWidth: 1,
    placesLayerName: "places",

    /** Figures are drawn at map size times the zoom, kept within these bounds. */
    minFigureScale: 1.5,
    maxFigureScale: 4,

    activity: {
      /** The interaction name the sim uses for sleeping in a bed. */
      sleepInteraction: "sleep",
      /** Shown over an agent while it runs one of these interactions. */
      interactionGlyphs: {
        "bake bread": "🍞",
        "brew ale": "🍺",
        "play cards": "🃏",
        "harvest wheat": "🌾",
        "chop wood": "🪓",
        read: "📜",
        "post a note": "📝",
        sit: "🪑",
        eat: "🍽",
        drink: "🍺",
      } as Readonly<Record<string, string>>,
      /** Shown for action kinds without a more specific glyph. */
      actionGlyphs: {
        wait: "⏳",
        interact: "✋",
      } as Readonly<Record<string, string>>,
    },

    /**
     * Sky tint over the map through the day: hour (0–24) to an RGB color and opacity. Between two
     * keyframes the tint blends linearly; the list starts at hour 0 and ends at hour 24.
     */
    daylightKeyframes: [
      { hour: 0, color: [16, 22, 64], alpha: 0.55 },
      { hour: 4.5, color: [16, 22, 64], alpha: 0.5 },
      { hour: 6, color: [255, 150, 90], alpha: 0.2 },
      { hour: 8, color: [255, 200, 140], alpha: 0 },
      { hour: 17, color: [255, 180, 110], alpha: 0 },
      { hour: 19, color: [255, 120, 70], alpha: 0.22 },
      { hour: 21, color: [24, 28, 80], alpha: 0.45 },
      { hour: 24, color: [16, 22, 64], alpha: 0.55 },
    ] as readonly { hour: number; color: readonly [number, number, number]; alpha: number }[],
  },

  camera: {
    /** Absolute upper zoom, in screen pixels per map pixel. */
    maxZoom: 8,
    /** How far you can zoom out, as a fraction of the zoom that fits the whole map. */
    minZoomRelativeToFit: 0.75,
    /** Each wheel event multiplies the zoom by e^(-deltaY × this). */
    wheelZoomSensitivity: 0.0015,
    buttonZoomFactor: 1.4,
    /** Zoom used when double-clicking an agent. */
    focusAgentZoom: 4,
    /** Margin around a focused group of agents, in tiles. */
    focusPaddingTiles: 4,
    focusMaxZoom: 5,
    /** Time for the camera to cover half the remaining distance to its target. */
    easeHalfLifeMs: 90,
    /** Below this difference (map pixels or zoom units) the camera snaps to its target. */
    settleEpsilon: 0.01,
    /** Pointer travel before a press becomes a drag instead of a click. */
    dragThresholdPx: 4,
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
