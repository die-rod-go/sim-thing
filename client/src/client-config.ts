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
    tileSizePixels: 16,
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
    textResolution: 4,
    selectionRingRadius: 8,
    visibleTileAlpha: 0.28,
    speechReachLineWidth: 1,
  },

  ui: {
    maxPersonalityHistoryShown: 50,
  },
} as const;
