import { describe, expect, it } from "vitest";
import { config } from "../config";
import { describeAroundYou } from "./around-you";
import type { DecisionContext, RecalledMemory } from "./context";
import { buildDecisionPrompt, estimatePromptTokens } from "./decision-prompt";
import { describeStats, describeStatus, describeTraits } from "./words";

function buildContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    name: "Mara",
    profession: "baker; works at the bakery",
    personality: {
      traits: {
        extraversion: -0.5,
        agreeableness: 0.3,
        conscientiousness: 0.8,
        neuroticism: 0,
        openness: -0.9,
      },
      core: "Values honest work. Fears debt.",
      selfImage: "The one who keeps the village fed.",
    },
    mood: "busy but content",
    needs: { hunger: 0.4, energy: 0.9, social: 0.45, fun: 0.6 },
    health: 1,
    body: { sleepRecoveryPerHour: 0.15, strength: 0.7, agility: 0.3 },
    goals: [
      { text: "Bake every day", why: "people rely on me", progress: "on track", kind: "world" },
    ],
    dailyPlan: "Bake at dawn, sell at the square.",
    intention: "going to buy wheat from Tom, offering 2 coins",
    simTime: "Day 1, 06:30",
    place: "bakery",
    nearbyEntities: [{ text: "oven", verbs: ["bake bread"], condition: null }],
    aroundYou: { entries: [], normalHearerIds: [], whisperHearerIds: [] },
    belongings: [
      { text: "30 coins", verbs: [], condition: null },
      { text: "2 bread", verbs: ["eat"], condition: null },
    ],
    itemlessVerbs: [],
    workingMemory: ["I baked bread at the oven."],
    conversation: [{ speakerName: "Tom", words: "Morning, Mara!", minutesAgo: 2 }],
    recalledMemories: {},
    knownPlaces: ["bakery", "farm", "town square"],
    currentAction: null,
    isMidActionInterrupt: false,
    lastFailure: null,
    validTargets: { places: ["bakery", "farm"], agents: ["Tom"], entities: ["oven"], aimOnly: [] },
    validItems: [{ name: "coin", plural: "coins" }, { name: "bread" }],
    ...overrides,
  };
}

function manyMemories(count: number, text: string): RecalledMemory[] {
  return Array.from({ length: count }, (_unused, index) => ({
    text: `${text} ${index} ${"lorem ipsum ".repeat(12)}`,
    minutesAgo: (index + 1) * 10,
  }));
}

describe("buildDecisionPrompt", () => {
  it("renders health and needs as words not numbers", () => {
    const needs = { hunger: 0.4, energy: 0.9, social: 0.45, fun: 0.6 };
    expect(describeStatus({ health: 1, needs })).toBe(
      "You are unhurt, quite hungry, rested, a bit lonely and fairly entertained.",
    );
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain("quite hungry");
    expect(prompt).not.toMatch(/0\.4\b/);
  });

  it("puts pressing needs first, lowest first, each with how it feels", () => {
    const needs = { hunger: 0.25, energy: 0.05, social: 0.9, fun: 0.45 };
    expect(describeStatus({ health: 0.7, needs })).toBe(
      "You are exhausted: you can barely keep your eyes open and need to sleep now. " +
        "You are very hungry: your stomach aches and you need to eat soon. " +
        "Otherwise you are bruised, socially fulfilled and a bit bored.",
    );
  });

  it("puts a serious wound first like a pressing need", () => {
    const needs = { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 };
    expect(describeStatus({ health: 0.3, needs })).toMatch(
      /^You are badly wounded: your wounds throb and you feel faint\. Otherwise you are well fed/,
    );
  });

  it("describes the agent's own stats as words in Who you are", () => {
    const context = buildContext();
    expect(describeStats(context.body)).toBe("quite strong, rather clumsy");
    const prompt = buildDecisionPrompt(context);
    const whoSection = prompt.slice(
      prompt.indexOf("## Who you are"),
      prompt.indexOf("## How you feel"),
    );
    expect(whoSection).toContain("Your body: quite strong, rather clumsy");
  });

  it("shows needs next to the time in the Now section", () => {
    const prompt = buildDecisionPrompt(buildContext());
    const nowSection = prompt.slice(prompt.indexOf("## Now"), prompt.indexOf("## Where you are"));
    expect(nowSection).toContain("quite hungry");
  });

  it("renders traits as words", () => {
    expect(describeTraits(buildContext().personality.traits)).toBe(
      "quite introverted, quite agreeable, very conscientious, moderately anxious, very traditional",
    );
  });

  it("includes the intention as 'You were:'", () => {
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain("You were: going to buy wheat from Tom, offering 2 coins");
  });

  it("shows what can be seen of each nearby object after its verbs", () => {
    const prompt = buildDecisionPrompt(
      buildContext({
        nearbyEntities: [
          { text: "wheat field", verbs: ["harvest wheat"], condition: "empty" },
          { text: "bench", verbs: ["sit"], condition: null },
        ],
      }),
    );
    expect(prompt).toContain("Here: wheat field (harvest wheat; empty), bench (sit)");
  });

  it("lists belongings with their verbs inline, coins included", () => {
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain("You carry: 30 coins, 2 bread (eat).");
    expect(prompt).not.toContain("You can also:");
  });

  it("lists verbs that need no item after belongings", () => {
    const prompt = buildDecisionPrompt(buildContext({ itemlessVerbs: ["punch"] }));
    expect(prompt).toContain("You carry: 30 coins, 2 bread (eat).\nYou can also: punch.");
  });

  it("offers continue only when interrupted mid-action", () => {
    const calm = buildDecisionPrompt(buildContext());
    expect(calm).toMatch(/^Actions: walk_to, interact, give, recall, wait$/m);
    const interrupted = buildDecisionPrompt(
      buildContext({
        currentAction: { description: "baking bread at the oven", minutesLeft: 40 },
        isMidActionInterrupt: true,
      }),
    );
    expect(interrupted).toMatch(/^Actions: .*continue$/m);
    expect(interrupted).toContain("You are in the middle of: baking bread at the oven");
  });

  it("groups recalled memories by bucket in their own sections", () => {
    const prompt = buildDecisionPrompt(
      buildContext({
        recalledMemories: { people: [{ text: "Tom owes me 3 coins.", minutesAgo: 600 }] },
      }),
    );
    expect(prompt).toContain("## Memories: people\n- Tom owes me 3 coins. (10 h ago)");
    expect(prompt).not.toContain("## Memories: seen");
  });

  it("trims recalled memories first when over the token target", () => {
    const context = buildContext({
      recalledMemories: {
        seen: manyMemories(60, "I saw a cart"),
        people: [{ text: "Tom owes me 3 coins.", minutesAgo: 600 }],
      },
    });
    const prompt = buildDecisionPrompt(context);
    expect(estimatePromptTokens(prompt)).toBeLessThanOrEqual(config.decision.promptTokenTarget);
    expect(prompt).toContain("Tom owes me 3 coins.");
    expect(prompt).toContain("I saw a cart 0 ");
    expect(prompt).not.toContain("I saw a cart 59 ");
    expect(prompt).toContain("You were: going to buy wheat");
  });
});

describe("describeAroundYou", () => {
  it("writes the Around you section in the brief's style", () => {
    const text = describeAroundYou({
      entries: [
        {
          agentId: "bob",
          name: "Bob",
          via: "saw",
          place: "bakery",
          doing: "kneading dough",
          minutesAgo: 0,
          isInSight: true,
          isDead: false,
          healthAsSeen: null,
          visibleCarried: [],
        },
        {
          agentId: "clara",
          name: "Clara",
          via: "saw",
          place: "bakery",
          doing: "",
          minutesAgo: 0,
          isInSight: true,
          isDead: false,
          healthAsSeen: null,
          visibleCarried: [],
        },
        {
          agentId: "dave",
          name: "Dave",
          via: "saw",
          place: "bakery",
          doing: "walking into the back room",
          minutesAgo: 3,
          isInSight: false,
          isDead: false,
          healthAsSeen: null,
          visibleCarried: [],
        },
        {
          agentId: "ed",
          name: "Ed",
          via: "heard",
          place: "the street",
          doing: "talking",
          minutesAgo: 5,
          isInSight: false,
          isDead: false,
          healthAsSeen: null,
          visibleCarried: [],
        },
        {
          agentId: "fay",
          name: "Fay",
          via: "saw",
          place: "farm",
          doing: "",
          minutesAgo: 90,
          isInSight: false,
          isDead: false,
          healthAsSeen: null,
          visibleCarried: [],
        },
      ],
      normalHearerIds: ["bob", "clara"],
      whisperHearerIds: ["bob"],
    });
    expect(text).toBe(
      [
        "In sight, would hear you: Bob (kneading dough), Clara.",
        "Within whisper reach: Bob.",
        "Recently around, now out of sight: Dave, seen 3 min ago walking into the back room (bakery).",
        "Ed's voice, heard 5 min ago from the street.",
      ].join("\n"),
    );
  });

  it("shows how hurt others look once it shows, and the dead as bodies", () => {
    const base = { via: "saw" as const, place: "bakery", minutesAgo: 0, isInSight: true };
    const text = describeAroundYou({
      entries: [
        {
          ...base,
          agentId: "bob",
          name: "Bob",
          doing: "sitting",
          isDead: false,
          healthAsSeen: "looks hurt",
          visibleCarried: [],
        },
        {
          ...base,
          agentId: "mara",
          name: "Mara",
          doing: "lying dead",
          isDead: true,
          healthAsSeen: null,
          visibleCarried: [],
        },
      ],
      normalHearerIds: ["bob", "mara"],
      whisperHearerIds: [],
    });
    expect(text).toBe(
      ["In sight, would hear you: Bob, looks hurt (sitting).", "Also in sight: Mara's body."].join(
        "\n",
      ),
    );
  });

  it("says when no one is around", () => {
    expect(describeAroundYou({ entries: [], normalHearerIds: [], whisperHearerIds: [] })).toBe(
      "No one else is around.",
    );
  });
});
