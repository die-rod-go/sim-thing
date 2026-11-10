import { describe, expect, it } from "vitest";
import { config } from "../config";
import { describeAroundYou } from "./around-you";
import type { DecisionContext, RecalledMemory } from "./context";
import { buildDecisionPrompt, estimatePromptTokens } from "./decision-prompt";
import { describeNeeds, describeTraits } from "./words";

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
    goals: [
      { text: "Bake every day", why: "people rely on me", progress: "on track", kind: "world" },
    ],
    dailyPlan: "Bake at dawn, sell at the square.",
    intention: "going to buy wheat from Tom, offering 2 coins",
    simTime: "Day 1, 06:30",
    place: "bakery",
    nearbyObjects: [{ name: "oven", interactions: ["bake bread"] }],
    aroundYou: { entries: [], normalHearerIds: [], whisperHearerIds: [] },
    coins: 30,
    inventory: { bread: 2, wheat: 0 },
    workingMemory: ["I baked bread at the oven."],
    conversation: [{ speakerName: "Tom", words: "Morning, Mara!", minutesAgo: 2 }],
    recalledMemories: {},
    knownPlaces: ["bakery", "farm", "town square"],
    currentAction: null,
    isMidActionInterrupt: false,
    lastFailure: null,
    validTargets: { places: ["bakery", "farm"], agents: ["Tom"], objects: ["oven"], heldItems: [] },
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
  it("renders needs as words not numbers", () => {
    expect(describeNeeds({ hunger: 0.4, energy: 0.9, social: 0.45, fun: 0.6 })).toBe(
      "quite hungry, rested, a bit lonely, fairly entertained",
    );
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain("quite hungry");
    expect(prompt).not.toMatch(/0\.4\b/);
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
        },
        {
          agentId: "clara",
          name: "Clara",
          via: "saw",
          place: "bakery",
          doing: "",
          minutesAgo: 0,
          isInSight: true,
        },
        {
          agentId: "dave",
          name: "Dave",
          via: "saw",
          place: "bakery",
          doing: "walking into the back room",
          minutesAgo: 3,
          isInSight: false,
        },
        {
          agentId: "ed",
          name: "Ed",
          via: "heard",
          place: "the street",
          doing: "talking",
          minutesAgo: 5,
          isInSight: false,
        },
        {
          agentId: "fay",
          name: "Fay",
          via: "saw",
          place: "farm",
          doing: "",
          minutesAgo: 90,
          isInSight: false,
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

  it("says when no one is around", () => {
    expect(describeAroundYou({ entries: [], normalHearerIds: [], whisperHearerIds: [] })).toBe(
      "No one else is around.",
    );
  });
});
