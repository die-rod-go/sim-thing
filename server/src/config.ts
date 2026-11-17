import type {
  LlmCallKind,
  NeedName,
  PersonEntry,
  StatName,
  TraitName,
  Volume,
  WorldEventKind,
} from "@village/shared";
import type { LlmEffort } from "./llm/types";

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
}

/** A health level: what the agent feels about itself, and what others see once it shows. */
export interface HealthWord {
  below: number;
  text: string;
  /** What others in sight see; only shown below `health.visibleToOthersBelow`. */
  looks: string;
  /** What serious harm feels like; a level with one is pressing, like a need. */
  urge?: string;
  /** Extra share of time a verb takes at this level, as for needs. */
  slowdown?: number;
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
    /** A diagonal step costs this much more than a straight one, so earshot is roughly round. */
    diagonalSoundCostMultiplier: Math.SQRT2,
    muffledReachMultiplier: 1.5,
    speechLoudness: { whisper: 2, normal: 10, shout: 24 } satisfies Record<Volume, number>,
    /** Sleepers only hear their own name or sounds at least this loud. */
    sleeperHearingLoudness: 20,
    /** Why an awake agent who clearly hears its own name gets an urgent decision. */
    ownNameReason: "{speaker} said my name",
    /**
     * How a position outside every place on the map is named: after the nearest place. `walk_to`
     * accepts the name, and leads to the outdoor tile nearest that place.
     */
    outdoorPlaceText: "the road by the {place}",
    /** A perception interrupt gives an agent a new decision at most this often. */
    interruptCooldownTicks: 20,
    /** "Around you" lists agents perceived within this many sim-minutes; "Not seen lately" the rest. */
    awarenessPromptWindowMinutes: 60,
    notSeenLatelyTitle: "Not seen lately",
    /**
     * How far off someone in sight reads in "Around you". Within `economy.giveReachTiles` they are
     * in reach (to hand things to, and for most verbs); within `nearTiles` they are near.
     */
    distanceWords: { inReach: "next to you", near: "a few steps away", far: "farther off" },
    nearTiles: 4,
    /** How an item on the ground reads in Here, indoors and out ("a knife (pick up; on the floor)"). */
    groundWords: { indoor: "on the floor", outdoor: "on the ground" },
    /** How what a thing holds reads, once the agent can see inside it. */
    contentsWords: { holding: "holding {items}" },
    /** An agent sees what is directly inside a thing within this many tiles of it. */
    contentsReachTiles: 1,
    /** Sound fills cached per source tile, muffling state and reach; the cache clears when full. */
    soundCacheMaxEntries: 512,
  },

  /**
   * What turns an awake agent's head. Urgent events always give a decision; notable ones do
   * within `perception.interruptCooldownTicks`; background ones never do. Every event the agent
   * perceives is still filed in its stream, so it is there at the next decision.
   */
  attention: {
    /**
     * Others' events of these kinds are background, unless aimed at the agent or what it carries,
     * an arrival where it is, a verb in `world.noticedVerbs`, or loud enough to turn heads.
     */
    backgroundEventKinds: [
      "walk_started",
      "arrived",
      "action_started",
      "action_finished",
    ] as WorldEventKind[],
    /** A sound at least this loud turns heads even muffled: as loud as wakes a sleeper. */
    noticeLoudness: 20,
    /** The decision reason for a notable event. */
    notableReason: "something new caught my attention",
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
     * A level with an `urge` is pressing: its own sentence, in a closing section of the decision
     * prompt. An urge says what going on without it costs, as the sim really does it.
     */
    words: {
      hunger: [
        {
          below: 0.1,
          text: "starving",
          urge: "you feel weak and shaky and need food now; half a day more without it and your health will start to fail",
          slowdown: 0.5,
        },
        {
          below: 0.3,
          text: "very hungry",
          urge: "your stomach aches and you need to eat soon; if you don't, you will be starving",
          slowdown: 0.2,
        },
        { below: 0.5, text: "quite hungry" },
        { below: 0.7, text: "a little peckish" },
        { below: Infinity, text: "well fed" },
      ],
      energy: [
        {
          below: 0.1,
          text: "exhausted",
          urge: "you can barely keep your eyes open and need to find a bed to sleep; until you do, everything takes far longer and your thoughts slip away",
          slowdown: 0.6,
        },
        {
          below: 0.3,
          text: "very tired",
          urge: "your body is heavy and you need sleep soon; it is already slowing you down",
          slowdown: 0.3,
        },
        { below: 0.5, text: "tired" },
        { below: 0.7, text: "a bit tired" },
        { below: Infinity, text: "rested" },
      ],
      social: [
        {
          below: 0.1,
          text: "desperately lonely",
          urge: "you ache for real company, and it is clouding your thoughts",
          slowdown: 0.1,
        },
        {
          below: 0.3,
          text: "lonely",
          urge: "you want someone to really talk to",
        },
        { below: 0.5, text: "a bit lonely" },
        { below: 0.7, text: "content with company" },
        { below: Infinity, text: "socially fulfilled" },
      ],
      fun: [
        {
          below: 0.1,
          text: "miserably bored",
          urge: "you badly need something enjoyable to do, and it is dragging on everything you do",
          slowdown: 0.1,
        },
        { below: 0.3, text: "bored", urge: "you want something enjoyable to do" },
        { below: 0.5, text: "a bit bored" },
        { below: 0.7, text: "fairly entertained" },
        { below: Infinity, text: "having a good time" },
      ],
    } satisfies Record<NeedName, NeedWord[]>,
  },

  sleep: {
    /**
     * How a sleep that ended reads: to those in sight, and to the sleeper, who is told why it
     * ended and what would let them sleep again. `{place}` is " in the <bed>" or nothing, `{slept}`
     * how long the sleep lasted.
     */
    wakeWords: {
      rested: {
        others: "woke up rested{place}",
        own: "woke up{place} after {slept} of sleep, fully rested: I can't sleep again until I'm tired",
      },
      hungry: {
        others: "woke up hungry{place}",
        own: "woke up{place} after {slept} of sleep because hunger won't let me stay asleep: I can't sleep again until I've eaten",
      },
      nap_over: {
        others: "woke up from the planned nap{place}",
        own: "woke up from the planned nap{place} after {slept} of sleep",
      },
      disturbed: {
        others: "woke up{place}",
        own: "woke up{place} after {slept} of sleep",
      },
    },
  },

  /**
   * How pressing needs and wounds get in the way, using the `slowdown` of
   * each level above. `{status}` becomes the words for what is getting in the way.
   */
  impairment: {
    slowStartText: "This will take longer than usual because I'm {status}",
    slowOngoingText: "slow going because you are {status}",
    slowFinishText: "slowly, because I was {status}",
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
    /**
     * Checked in order like need words: the first whose `below` exceeds the value wins. The words
     * don't say what did the harm (a blow, a fire, hunger): the agent learns that from what it
     * perceived, and others from what they see, like bleeding.
     */
    words: [
      {
        below: 0.15,
        text: "near death",
        looks: "looks near death",
        urge: "you can barely stand and feel your life slipping away",
        slowdown: 0.8,
      },
      {
        below: 0.35,
        text: "in a bad way",
        looks: "looks in a bad way",
        urge: "your body is failing and you feel faint",
        slowdown: 0.4,
      },
      { below: 0.6, text: "in poor shape", looks: "looks in poor shape" },
      { below: 0.9, text: "a little worse for wear", looks: "looks a little worse for wear" },
      { below: Infinity, text: "unhurt", looks: "looks unhurt" },
    ] satisfies HealthWord[] as HealthWord[],
    /** The starving sentence's urge once going without food has begun to cost health. */
    starvationHarmUrge:
      "you feel weak and shaky and need food now; going without it is already wearing your body down",
    /** The decision reason when health drops below one of `decisionThresholds`. */
    worsenedDecisionReason: "my health getting worse",
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
    /** The stream entry for coming upon a body not already known to lie dead. */
    foundBodyEntry: "I found {body} in {place}",
    /** The stream entry each time a body already known to lie dead comes into view again. */
    seenBodyEntry: "I saw {body} in {place}",
    /** Why finding a body gives an urgent decision; `{bodies}` lists the bodies found. */
    foundBodyReason: "I found {bodies}",
    /** How a body someone carries is described; `{holder}` is the carrier as seen. */
    carriedBy: "carried by {holder}",
    /** `{holder}` when the one looking is the carrier. */
    viewerAsHolder: "you",
    /** How a body inside a thing is described ("in the cart"). */
    inside: "in {holder}",
    /** Fills `{actor}` in a killed phrase when no agent did the damage. */
    unknownSource: "someone",
  },

  godMode: {
    /** What onlookers see when the viewer takes a person or thing away; its subject is what went. */
    vanishedDescription: "vanished into thin air",
    /** What onlookers see when the viewer puts a person or thing down; its subject is what came. */
    appearedDescription: "appeared out of thin air",
    /** How a person the viewer moved files arriving; `{place}` is where they now are. */
    movedOwnDescription: "suddenly found myself in {place}",
    /** Why the moved person gets a decision straight away. */
    movedDecisionReason: "I suddenly found myself somewhere else",
    /** How every living agent files the viewer's words; `{words}` is what was said. */
    voiceHeardDescription: 'A booming voice from the sky said: "{words}"',
    /** Length limit of the voice's stream entry, far above an ordinary one so it is heard whole. */
    voiceHeardMaxChars: 1500,
    /** Why hearing the voice gives an urgent decision; `{words}` is what was said. */
    voiceDecisionReason: 'a booming voice from the sky said: "{words}"',
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
    /** How an event names a thing an agent carries: to everyone, and to the agent carrying it. */
    carriedThingNames: { others: "{holder}'s {thing}", own: "my {thing}" },
    /** The text a `{ "newId": true }` value gives; `{number}` counts up through the world's life. */
    newIdFormat: "id-{number}",
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
    /** Most a trait moves in one identity pass. */
    passDeltaClamp: 0.003,
    /** Trait values are rounded to this many decimals after a change. */
    traitValueDecimals: 3,
    /** How a trait reads in a pass prompt: its value and the words for it. */
    valueText: "{trait}: {value} ({words})",
    min: -1,
    max: 1,
  },

  economy: {
    giveReachTiles: 1,
    /** An offer nobody answers lapses after this long, as if turned down. */
    offerLapseMinutes: 10,
    offer: {
      /** The `offered` event; `{recipient}` and `{what}` ("3 coins"). Its subject is the giver. */
      offeredDescription: "offered {recipient} {what}",
      /** How the recipient files the offer; its subject is the giver. */
      offeredTargetDescription: "offered me {what}",
      /** Why the recipient gets an urgent decision. */
      decisionReason: "{giver} is offering me {what}",
      /** The `declined` event; its subject is the recipient. */
      declinedDescription: "turned down the {what} {giver} offered",
      /** How the giver files a refusal; its subject is the recipient. */
      declinedTargetDescription: "turned down the {what} I offered",
      /** Why the giver gets an urgent decision after a refusal. */
      declinedDecisionReason: "{recipient} turned down the {what} I offered",
      /** Private stream entries when the recipient lets the offer go unanswered. */
      unansweredRecipientEntry: "I didn't take the {what} {giver} offered me",
      unansweredGiverEntry: "{recipient} didn't take the {what} I offered",
      /** Private stream entries when the giver moved out of reach or died before an answer. */
      withdrawnRecipientEntry: "{giver} was gone before I took the {what} they offered me",
      withdrawnGiverEntry: "I left before {recipient} took the {what} I offered",
      /** Private stream entries when an accepted offer can't be handed over any more. */
      acceptFailedRecipientEntry:
        "I went to take the {what} {giver} offered me, but they no longer had them",
      acceptFailedGiverEntry:
        "{recipient} went to take the {what} I offered, but I no longer had them",
      /** Why an offer to someone fails. */
      asleepReason: "{recipient} is asleep",
      alreadyOfferedReason: "{recipient} hasn't answered another offer yet",
      /** Why a giver can't offer the same person something else before the first is answered. */
      alreadyOfferingReason: "I was already offering {recipient} {what}",
      /** Why an offer fails, or stops standing, when the recipient is close but out of sight. */
      outOfSightReason: "I couldn't reach {recipient} from where I stood",
    },
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
    /** Ticks after the last attack or miss anywhere in the village during which a fight is on. */
    fightTicks: 10,
    /** The event for damage that isn't an attack. Its subject is the actor. */
    hurtDescription: "was hurt",
    /** What onlookers learn of a failed attempt. `{attempt}` is the act, `{reason}` why it failed. */
    failedAttemptDescription: "tried to {attempt}, but {reason}",
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

  inspecting: {
    /** The `seen` memory an `inspect` step files. `{details}` is what was found, joined by commas. */
    memory: "I inspected the {thing}: {details}",
    /** Among the details when the thing hides what is inside it (a locked chest). */
    hiddenText: "I couldn't see inside it",
    /** The details when there was nothing to note. */
    nothingOfNoteText: "nothing of note",
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

  places: {
    /** How labelled things that differ only by a trailing number read together: "tree ×32". */
    numberedLabelsText: "{label} ×{count}",
    /**
     * The lines of "Places you know": each place seen, with what of use it held when last looked
     * into ("nothing of use" when that was nothing).
     */
    promptTexts: {
      noneSeen: "None yet.",
      lookedInto: "{place}: {entities}",
      nothingThere: "nothing of use",
    },
    /** Why a `walk_to` fails when nothing in the village goes by a name like its target. */
    unknownWalkTargetReason: "nothing in the village goes by that name",
    /**
     * How a `walk_to` name with no exact match finds a place or map object by its words:
     * "north spot" reaches the north fishing spot. A candidate's score is the words the two
     * names share over all the words either has; the best at or above the minimum wins.
     */
    walkNameMatch: {
      ignoredWords: ["the", "a", "an", "to", "at", "of", "by", "in", "on", "my", "your"],
      minimumScore: 0.5,
    },
  },

  walking: {
    /** A walker whose way stays blocked by other agents this many ticks gives up the walk. */
    blockedGiveUpTicks: 5,
    /** Walkers arriving at an indoor place stop at least this many steps from its doorways. */
    arrivalDoorwayClearanceTiles: 2,
    blockedReason: "{agent} was in the way",
    /** Why a walk fails when no way leads there, even past everything that stands in the way. */
    noWayReason: "I couldn't find a way there",
    /**
     * Why a walk fails at something it can't get through (a locked door): `{thing}` is its name,
     * `{state}` how it looks ("closed and locked"), or the plain text when nothing shows.
     */
    blockingThingWords: {
      withState: "the {thing} is {state}",
      plain: "the {thing} is in the way",
      stateJoiner: " and ",
    },
    /**
     * When no way leads somewhere, the way is looked for again with what stands in the way
     * counted as this many extra steps, so it crosses as few of those things as it can.
     */
    blockedTileExtraSteps: 100,
  },

  memory: {
    /** Length limit of one stream entry; longer text is cut and ends with an ellipsis. */
    streamEntryMaxChars: 200,
    /** Entries in the stream before an episode is made. */
    streamMax: 30,
    /** Newest entries left in the stream when an episode forms. */
    streamKeep: 5,
    /** Episodes before a chronicle is made. */
    episodesMax: 9,
    /** Newest episodes left when a chronicle forms. */
    episodesKeep: 1,
    /** Earlier episodes the episode summarizer sees for context. */
    earlierEpisodesShown: 1,
    /** Earlier chronicles the chronicle summarizer sees for context. */
    earlierChroniclesShown: 1,
    /** Length limits the summarizers are asked to keep to; see `llm.replyTextSlack`. */
    episodeMaxChars: 345,
    chronicleMaxChars: 1150,
    daySummaryMaxChars: 1150,
    historyMaxChars: 1700,
    /** Wait before retrying a summary that failed all its attempts. */
    retryAfterTicks: 40,
    /** An agent takes part in a conversation if it spoke within earshot of the speaker this recently. */
    participationWindowTicks: 10,
    /** How a stream entry reads in a prompt; `{time}` is absolute. A merged repeat shows its span and count. */
    streamTexts: {
      entry: "[{time}] {text}",
      repeated: "[{time} to {endTime}] {text} (×{count})",
      empty: "Nothing yet.",
    },
    /** How a summary reads in a prompt: the absolute span it covers, then its text. */
    summaryText: "[{time} to {endTime}] {text}",
    /** Shown to a summarizer that has no earlier summary to build on. */
    noEarlierText: "Nothing earlier.",
    /** The decision prompt's titles for each level of memory; a level with nothing has no section. */
    promptTitles: {
      history: "Before yesterday",
      daySummary: "Yesterday",
      chronicles: "Earlier today",
      episodes: "More recently",
    },
  },

  people: {
    /** New episodes between runs of the people pass. */
    everyEpisodes: 3,
    /** Length limit of each of a person entry's fields; see `llm.replyTextSlack`. */
    fieldMaxChars: 200,
    /** How each field of a person entry is labelled in prompts. */
    fieldLabels: {
      whatIThinkOfThem: "What I think of them",
      whatTheyThinkOfMe: "What they think of me",
      whatIWantFromThem: "What I want from them",
      whatTheyWantFromMe: "What they want from me",
      misc: "Other things about them",
    } satisfies Record<keyof PersonEntry, string>,
    /** Shown beside a person the agent holds nothing about yet. */
    emptyEntryText: "nothing yet beyond what you see.",
    /** The section's text when the agent knows no one. */
    nobodyKnownText: "No one yet.",
    /** Length of a person's one line under "People you know": what the agent thinks of them. */
    summaryMaxChars: 120,
    /**
     * Most full entries in "People on your mind": people in the conversation, then in sight, then
     * named in the agent's intention.
     */
    fullEntriesMax: 4,
    onMindTitle: "People on your mind",
    onMindIntro:
      "What you hold about the people around you or on your mind. What they think and want is your own reading, and may be wrong.",
  },

  goals: {
    maxLongTerm: 2,
    /** Length limit of each long-term goal text (goal, reason, progress). */
    longTermFieldMaxChars: 250,
    noLongTermText: "No long-term goals right now.",
  },

  /**
   * Today: the agent's own plan, a short list of outcomes it writes on waking (the day plan) and
   * keeps with its decisions, each item numbered for as long as it lasts.
   */
  agenda: {
    maxItems: 6,
    /** Length limit of one item; see `llm.replyTextSlack`. */
    itemMaxChars: 160,
    /** Most items one decision may add. */
    maxAddedPerDecision: 2,
    /** A sleep at least this long ends in a day plan; so does the start of the sim. */
    dayPlanMinSleepHours: 3,
    /** Longest a waking agent lies awake waiting for its day plan before deciding anyway. */
    dayPlanMaxWaitTicks: 30,
    /** Today when the agenda is empty. */
    nothingPlannedText: "Nothing planned for the rest of today.",
    /** How an item reads in Today: its number, its hour when it has one, and its text. */
    itemText: "{number}. {text}",
    itemWithHourText: "{number}. {time}: {text}",
    /** How a finished or dropped item enters the stream, in the agent's own voice. */
    finishedText: "I finished: {item}",
    droppedText: "I gave up on: {item}",
    /** The decision reason when an item's hour comes; `{time}` is the hour. */
    reminderReasonText: "it is {time}: {item}",
    /** Filed on waking for an item whose hour passed in sleep. */
    missedText: "I slept through: {item}",
  },

  realityPass: {
    /** New episodes between runs of the reality pass. */
    everyEpisodes: 2,
    /** Length limit of the thought it gives the agent; see `llm.replyTextSlack`. */
    thoughtMaxChars: 1000,
    /** Length limit of its note for the prompt viewer, which the agent never sees. */
    noticedMaxChars: 1000,
    /** How the thought enters the agent's stream, in the agent's own voice. */
    thoughtStreamText: "It dawned on me: {thought}",
    placeJoiner: ", ",
  },

  /**
   * How `items.json` reads in "Everything that can exist", which every decision, plan and pass
   * shows: each thing with the verbs a person can use on it.
   */
  worldCatalog: {
    thingWithVerbs: "{name}: {verbs}",
    creatureName: "{name} (an animal)",
    verbWithDetails: "{verb} ({details})",
    needsText: "needs {things}",
    usesText: "uses {things}",
    makesText: "makes {things}",
    carriedThings: "Anything that can be carried can also be used with: {verbs}",
    bareHanded: "Done bare-handed, at someone or something: {verbs}",
    verbJoiner: "; ",
    partJoiner: "; ",
    listJoiner: ", ",
    alternativesJoiner: " or ",
  },

  decision: {
    /**
     * The running sim lets the clock go on while an agent interrupted mid-action decides; idle
     * agents' decisions still hold it. Tests always wait for every call.
     */
    shouldCallLlmInBackground: true,
    /**
     * Whether decisions stay in the background while a fight is on (`combat.fightTicks`). Off, every
     * decision holds the clock until it lands, so a fight doesn't run ahead of the fighters' replies.
     */
    shouldCallLlmInBackgroundDuringFight: false,
    /**
     * Longest an idle agent's decision holds the clock in real time; past it the tick goes on and
     * the plan lands on a later tick, so one slow call can't stall the village.
     */
    idleDecisionWaitMs: 3000,
    /**
     * What an agent remembers when a reply named something that isn't there (the reply was rejected
     * and asked again). `{name}` is the name as the reply wrote it.
     */
    unknownNameTexts: {
      thing: "I looked for {name}, but there was nothing and no one by that name here or on me",
    },
    /** Rough characters per token, for estimating token counts. Measured from logged Haiku calls: about 2.3. */
    charsPerToken: 2.3,
    defaultWaitMinutes: 10,
    /** How long a speaker stays to hear an answer when the reply names no minutes. */
    sayWaitMinutes: 5,
    maxWaitMinutes: 240,
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
      // Each summary's length limit with `replyTextSlack`, at about one token per character.
      episode: 520,
      chronicle: 1730,
      day_summary: 1730,
      history: 2550,
      // Each pass's largest possible reply: every text at its limit with the slack. The people
      // pass allows for a village of about a dozen people rewritten at once.
      people: 16000,
      day_plan: 5000,
      identity: 3000,
      long_term_goals: 6000,
      reality: 1500,
    },
    /** Calls of these kinds use `LLM_REFLECTION_MODEL` when it is set. */
    reflectionKinds: [
      "people",
      "day_plan",
      "identity",
      "long_term_goals",
      "reality",
    ] as LlmCallKind[],
    /** Calls of these kinds keep the model's thinking on even with `LLM_DISABLE_THINKING=true`. */
    thinkingKinds: [
      "people",
      "day_plan",
      "identity",
      "long_term_goals",
      "reality",
    ] as LlmCallKind[],
    /**
     * Added to `maxReplyTokens` for those kinds: thinking counts against `max_tokens`, so without
     * it the thinking could use up the room meant for the reply. A ceiling, billed only if used.
     */
    thinkingTokenAllowance: 8000,
    /**
     * Effort per call kind, sent as Anthropic's `output_config.effort` (low, medium, high, xhigh,
     * max); kinds left out use the model's default, `medium` on Claude Haiku 5.5. Not sent to
     * OpenAI-compatible providers.
     */
    effortByKind: {
      decision: "low",
      people: "medium",
      day_plan: "high",
      identity: "medium",
      long_term_goals: "high",
      reality: "high",
    } as Partial<Record<LlmCallKind, LlmEffort>>,
    dailyTokenBudget: 999_999_999,
    /**
     * List prices in dollars per million tokens, for estimating spend. A model takes the first
     * entry whose `model` appears in its id once dots read as dashes ("claude-haiku-5.5" too).
     */
    prices: [
      { model: "haiku-5-5", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
      { model: "sonnet-5-5", input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    ],
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
      actionWeights: { walk_to: 3, interact: 4, say: 2, wait: 2, give: 0.5 },
      /** Verbs with a hit roll are picked this rarely, so soak runs see fights without a massacre. */
      attackWeight: 0.05,
      continueChance: 0.5,
      omitVerbChance: 0.25,
      /** A carried item with this verb is eaten whenever the status line holds a hungry word. */
      eatVerb: "eat",
      /** Chance a verb used with a carried item is also aimed at something here or at itself. */
      aimChance: 0.5,
      hungryWords: ["starving", "very hungry", "quite hungry"],
      /** Text in the prompt that means someone is offering the agent something. */
      offerMarker: "is offering you",
      acceptOfferChance: 0.7,
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

  /** `npm run measure -w @village/server`: what a saved run did, read from its database. */
  measure: {
    /** A speaker's line is a near repeat when it overlaps one of its own last lines this much. */
    nearRepeatLookbackLines: 6,
    nearRepeatSimilarity: 0.5,
    /** A line someone says passes on a line they overheard when it overlaps it this much. */
    passedOnSimilarity: 0.3,
    /** A line said this long after the last one at the same place starts a new conversation. */
    conversationGapMinutes: 10,
    /** How many of the commonest decision reasons and failure reasons are listed. */
    topReasonCount: 15,
    /** Stands in for a person's name, and for a number, when reasons are grouped. */
    namePlaceholder: "{name}",
    numberPlaceholder: "#",
  },
};

export type Config = typeof config;
