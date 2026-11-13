import { GLYPH_SHEET } from "@village/shared";

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
    maxMoments: 200,
  },

  map: {
    mapUrl: "/village.json",
    glyphSheetUrl: `/${GLYPH_SHEET.fileName}`,
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
    /** Text sizes in screen pixels, by how loudly the line was said. */
    speechBubbleFontSizes: { whisper: 10, normal: 10, shout: 12 },
    speechBubbleLeaderLineWidth: 1,
    speechBubbleLeaderLineAlpha: 0.6,
    /** How much of the speaker's color is mixed into a speech bubble's background, 0–1. */
    speechBubbleSpeakerTint: 0.18,
    /** Space between the top of a figure and the bottom of its bubble stack. */
    speechBubbleOffsetAboveFigure: 14,
    /** How far a stack may slide sideways to clear a neighbor's, as a share of its own width. */
    speechBubbleMaxSideShiftFraction: 0.5,
    /** Speakers closer than this horizontally share a column, so their stacks pile up instead. */
    speechBubbleSameColumnTolerance: 1,
    /** How far in from a stack's corners a sideways leader line may start. */
    speechBubbleLeaderLineInset: 8,
    /** Agents are drawn as this glyph of the sheet (a smiley face) in their own color. */
    agentGlyphIndex: 1,
    /** A one-glyph-pixel outline around each agent, so it stands out from the tiles under it. */
    agentOutlineColor: "#0c0c10",
    /** In map pixels, scaled with the figure. */
    selectionRingRadius: 11,
    visibleTileAlpha: 0.28,
    speechReachLineWidth: 1,
    placesLayerName: "places",

    /** Thought clouds: longest text shown before an ellipsis, wrap width, and how long they last. */
    thoughtBubbleMaxLength: 90,
    thoughtBubbleWrapWidth: 200,
    thoughtBubbleFontSize: 12,
    thoughtMaxAgeTicks: 30,
    /** localStorage key for whose thoughts are shown; this viewer's choice survives a reload. */
    thoughtModeStorageKey: "village.thoughtMode",
    /** localStorage key for the agents whose speech bubbles this viewer has muted. */
    mutedSpeakersStorageKey: "village.mutedSpeakers",

    /** Pointer rest time before an agent's hover card appears, and where it sits. */
    hoverCardDelayMs: 350,
    hoverCardOffsetPx: 18,
    hoverCardViewMarginPx: 8,

    activity: {
      /** The verb the sim uses for sleeping in a bed. */
      sleepVerb: "sleep",
      /** Shown over an agent while it runs one of these verbs. */
      verbGlyphs: {
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
    /** Director mode cuts to a new shot this often, judging liveliness by lines this recent. */
    directorIntervalMs: 6000,
    directorRecentWindowTicks: 15,
  },

  ui: {
    maxPersonalityHistoryShown: 50,
    maxTagChips: 30,
    /** Tallest a conversation card grows before it scrolls inside itself. */
    maxThreadHeightPx: 260,
    /** How close to the bottom a thread must be scrolled to keep following new lines. */
    threadStickSlackPx: 24,
    /** Fraction of the token budget at which the usage bar turns to a warning color. */
    tokenWarningFraction: 0.8,
    /** How long a moment notification stays up before it dismisses itself. */
    momentToastLifetimeMs: 9000,
    maxMomentToastsShown: 3,
    runTimerRefreshMs: 1000,
  },

  characterEditor: {
    traitStep: 0.05,
    statStep: 0.05,
    /** Words at the low and high end of each stat's slider. */
    statPoles: { strength: ["weak", "strong"], agility: ["clumsy", "nimble"] },
    sleepRecoveryStep: 0.01,
    defaultTextAreaRows: 2,
    coreTextAreaRows: 5,
  },

  itemEditor: {
    /** Starting names for things added in the editor; a number is appended when one is taken. */
    newDefinitionId: "new_item",
    newVerbName: "new verb",
    newComponentName: "new_component",
    newFieldName: "newField",
    /** Text of a field's new prompt-word entry. */
    newFieldWordText: "words",
    /** Minutes between firings of a rule switched to the `every` trigger. */
    newRuleMinutes: 60,
    /** Hint in the field for how a death from a rule reads. */
    killedPlaceholder: "burned to death",
    newStimulusName: "new_stimulus",
    /** Starting text for a new `set` field path and `announce` phrase. */
    newTextValue: "text",
    /** Starting numbers for the settings of a step added from the palette. */
    newStepMinutes: 1,
    newStepAmount: 0.1,
    newStepChance: 0.5,
    newStepLoudness: 1,
    newStepCount: 1,
    newStepRadius: 1,
    defaultTimesFactor: 1,
    /** A new item is drawn as a white bullet until it's given its own glyph. */
    newDefinitionGlyph: { index: 7, color: "#ffffff" },
    /** How many times larger than the sheet the glyph picker's grid is drawn. */
    glyphGridScale: 2,
    /** How many times larger than the sheet the chosen glyph's preview is drawn. */
    glyphPreviewScale: 6,
    /** The grid's glyphs are shown in the item's color, over this when it has no background. */
    glyphGridBackground: "#1e1e24",
    /** Step for literal numbers in verbs and effects. */
    numberStep: 0.01,
    /** How many matches a rule lists before folding the rest into "and N more". */
    maxListedRuleMatches: 12,
  },

  mapEditor: {
    /** Screen pixels per map pixel. */
    zoomLevels: [1, 1.5, 2, 3, 4],
    defaultZoom: 2,
    maxUndoSteps: 200,
    /** Largest width or height the size fields accept, in tiles. */
    maxMapSide: 256,
    newPlaceName: "new place",
    placeOutlineColor: "rgba(255, 207, 90, 0.85)",
    placeFillColor: "rgba(255, 207, 90, 0.08)",
    indoorPlaceOutlineColor: "rgba(106, 167, 255, 0.9)",
    indoorPlaceFillColor: "rgba(106, 167, 255, 0.1)",
    placeLabelFont: "11px system-ui, sans-serif",
    placeLabelColor: "#ffffff",
    placeLabelBackground: "rgba(0, 0, 0, 0.6)",
    placeLabelPadding: 3,
    placeLabelHeight: 14,
    selectionColor: "#ffffff",
    selectionLineWidth: 2,
    hoverColor: "rgba(255, 255, 255, 0.35)",
    previewColor: "rgba(106, 167, 255, 0.35)",
    gridColor: "rgba(255, 255, 255, 0.07)",
    /** Size of the square drawn at a place's bottom-right corner to show it can be resized. */
    resizeHandleFraction: 0.35,
    emptyTileColor: "#000000",
    /** Drawn for an item whose definition items.json no longer has. */
    unknownItemGlyph: { index: 63, color: "#ff6b6b" },
    /** Start tiles of characters missing from agents.json are drawn in this color. */
    unknownCharacterColor: "#8a91a0",
  },

  conversations: {
    /** A line more than this many ticks after the previous one at the same place opens a new thread. */
    maxGapTicks: 10,
  },

  shell: {
    rosterRailWidthPx: 230,
    collapsedRailWidthPx: 36,
    defaultSidePanelWidthPx: 460,
    minSidePanelWidthPx: 320,
    maxSidePanelWidthPx: 820,
    /** The side panel never takes more than this fraction of the window. */
    maxSidePanelWindowFraction: 0.6,
  },

  /** The Relations tab's who-talks-with-whom picture, in SVG pixels. */
  relationshipWeb: {
    sizePx: 260,
    ringRadiusPx: 95,
    nodeRadiusPx: 14,
    centerRadiusPx: 18,
    minEdgeWidthPx: 1,
    maxEdgeWidthPx: 7,
  },

  /** Hours that count as daytime for the clock's sun and moon. */
  daylight: {
    dayStartHour: 6,
    nightStartHour: 20,
  },

  /** localStorage keys; each viewer's layout and filters survive a reload. */
  storageKeys: {
    sidePanelWidth: "village.sidePanelWidth",
    isSidePanelCollapsed: "village.isSidePanelCollapsed",
    isRosterCollapsed: "village.isRosterCollapsed",
    sheetTab: "village.sheetTab",
    storyFilter: "village.storyFilter",
    activityFilter: "village.activityFilter",
    isNotifyingPersonalityChanges: "village.isNotifyingPersonalityChanges",
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

  /** Words for health levels, from worst to best, split like need levels. */
  healthLevels: {
    upperBounds: [0.15, 0.35, 0.6, 0.9],
    alertLevelIndex: 1,
    words: ["near death", "in a bad way", "in poor shape", "a little worse for wear", "unhurt"],
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
