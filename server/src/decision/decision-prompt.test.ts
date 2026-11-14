import { describe, expect, it } from "vitest";
import { config } from "../config";
import { describeAroundYou } from "./around-you";
import type { DecisionContext } from "./context";
import { buildCacheableDecisionPrompt, buildDecisionPrompt } from "./decision-prompt";
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
    isStarvationHarming: false,
    conditionWords: [],
    body: { sleepRecoveryPerHour: 0.15, strength: 0.7, agility: 0.3 },
    goals: [
      { text: "Bake every day", why: "people rely on me", progress: "on track", kind: "world" },
    ],
    intention: "going to buy wheat from Tom, offering 2 coins",
    simTime: "Day 1, 06:30",
    place: "bakery",
    nearbyEntities: [
      { text: "oven", details: [], verbs: ["bake bread"], toolUses: [], contents: [] },
    ],
    aroundYou: { entries: [], normalHearerIds: [], whisperHearerIds: [] },
    peopleOnMind: [],
    belongings: [
      { text: "30 coins", details: [], verbs: [], toolUses: [], contents: [] },
      { text: "2 bread", details: [], verbs: ["eat"], toolUses: [], contents: [] },
    ],
    itemlessVerbs: [],
    stream: [
      "[Day 1, 6:10 am] I baked bread at the oven",
      '[Day 1, 6:28 am] Tom said: "Morning, Mara!"',
    ],
    seenPlaces: [
      { name: "bakery", entityNames: ["oven", "2 bread"], seenAt: null },
      { name: "farm", entityNames: [], seenAt: "Day 1, 6:10 am" },
      { name: "town square", entityNames: null, seenAt: null },
    ],
    currentAction: null,
    isMidActionInterrupt: false,
    decisionReason: null,
    lastFailure: null,
    validTargets: { places: ["bakery", "farm"], agents: ["Tom"], entities: ["oven"], aimOnly: [] },
    validItems: [{ name: "coin", plural: "coins" }, { name: "bread" }],
    validHolders: [],
    ...overrides,
  };
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
      "You are exhausted: you can barely keep your eyes open and need to find a bed to sleep; " +
        "until you do, everything takes far longer and your thoughts slip away. " +
        "You are very hungry: your stomach aches and you need to eat soon; if you don't, you will be starving. " +
        "Otherwise you are a little worse for wear, socially fulfilled and a bit bored.",
    );
  });

  it("lists the agent's own conditions next to its health", () => {
    const needs = { hunger: 0.4, energy: 0.9, social: 0.9, fun: 0.9 };
    expect(describeStatus({ health: 0.5, needs }, ["bleeding"])).toMatch(
      /^You are in poor shape, bleeding, quite hungry, rested/,
    );
    const prompt = buildDecisionPrompt(buildContext({ conditionWords: ["poisoned"] }));
    expect(prompt).toContain("unhurt, poisoned, quite hungry");
  });

  it("lists settled needs under Now and gives pressing ones their own closing section", () => {
    const prompt = buildDecisionPrompt(
      buildContext({ needs: { hunger: 0.05, energy: 0.9, social: 0.9, fun: 0.9 } }),
    );
    expect(prompt).toContain("You are unhurt, rested, socially fulfilled and having a good time.");
    expect(prompt.trimEnd()).toMatch(
      /## What your body needs now\nYou are starving: you feel weak and shaky and need food now; [^\n]*\.$/,
    );
    expect(buildDecisionPrompt(buildContext())).not.toContain("What your body needs now");
  });

  it("puts serious harm first like a pressing need, without saying what caused it", () => {
    const needs = { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 };
    expect(describeStatus({ health: 0.3, needs })).toMatch(
      /^You are in a bad way: your body is failing and you feel faint\. Otherwise you are well fed/,
    );
  });

  it("says when going without food has begun to cost health", () => {
    const needs = { hunger: 0, energy: 0.8, social: 0.8, fun: 0.8 };
    expect(describeStatus({ health: 0.5, needs, isStarvationHarming: true })).toMatch(
      /^You are starving: you feel weak and shaky and need food now; going without it is already wearing your body down\. Otherwise you are in poor shape/,
    );
    expect(describeStatus({ health: 0.5, needs })).toMatch(
      /^You are starving: you feel weak and shaky and need food now; half a day more without it and your health will start to fail\. Otherwise/,
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

  it("shows what can be seen of each nearby object before its verbs", () => {
    const prompt = buildDecisionPrompt(
      buildContext({
        nearbyEntities: [
          {
            text: "wheat field",
            details: ["empty"],
            verbs: ["harvest wheat"],
            toolUses: [],
            contents: [],
          },
          { text: "bench", details: [], verbs: ["sit"], toolUses: [], contents: [] },
        ],
      }),
    );
    expect(prompt).toContain("Here:\n- wheat field, empty (harvest wheat)\n- bench (sit)");
  });

  it("lists belongings with their verbs inline, coins included", () => {
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain("You carry:\n- 30 coins\n- 2 bread (eat)");
    expect(prompt).not.toContain("You can also:");
  });

  it("lists verbs that need no item after belongings", () => {
    const prompt = buildDecisionPrompt(buildContext({ itemlessVerbs: ["punch"] }));
    expect(prompt).toContain("You carry:\n- 30 coins\n- 2 bread (eat)\nYou can also: punch.");
  });

  it("offers continue only when interrupted mid-action", () => {
    const calm = buildDecisionPrompt(buildContext());
    expect(calm).toMatch(/^Actions: walk_to, interact, give, wait$/m);
    expect(calm).not.toMatch(/^- continue:/m);
    const interrupted = buildDecisionPrompt(
      buildContext({
        currentAction: {
          description: "baking bread at the oven",
          minutesLeft: 40,
          slowedBy: null,
        },
        isMidActionInterrupt: true,
      }),
    );
    expect(interrupted).toMatch(/^Actions: .*continue$/m);
    expect(interrupted).toMatch(/^- continue:/m);
    expect(interrupted).toContain("You are in the middle of: baking bread at the oven");
  });

  it("shows what flagged the decision, and nothing when nothing did", () => {
    const flagged = buildDecisionPrompt(buildContext({ decisionReason: "Jess came into view" }));
    expect(flagged).toMatch(/^Just now: Jess came into view\.$/m);
    expect(buildDecisionPrompt(buildContext())).not.toContain("Just now:");
  });

  it("says why an interrupted action is going slowly", () => {
    const prompt = buildDecisionPrompt(
      buildContext({
        currentAction: {
          description: "chopping wood at the trees",
          minutesLeft: 40,
          slowedBy: "exhausted",
        },
        isMidActionInterrupt: true,
      }),
    );
    expect(prompt).toContain(
      "You are in the middle of: chopping wood at the trees (slow going because you are exhausted, about 40 min left).",
    );
  });

  it("lists the people on the agent's mind after the around-you section", () => {
    const prompt = buildDecisionPrompt(
      buildContext({ peopleOnMind: [{ name: "Tom", text: "Owes me 3 coins." }] }),
    );
    expect(prompt).toContain("## People on your mind\n- Tom: Owes me 3 coins.");
    expect(prompt.indexOf("## Around you")).toBeLessThan(prompt.indexOf("## People on your mind"));
  });

  it("says no one is on the agent's mind when the list is empty", () => {
    const prompt = buildDecisionPrompt(buildContext({ peopleOnMind: [] }));
    expect(prompt).toContain(`## People on your mind\n${config.dossier.nobodyOnMindText}`);
  });

  it("shows the whole stream, oldest first, and says so when it is empty", () => {
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain(
      [
        "- [Day 1, 6:10 am] I baked bread at the oven",
        '- [Day 1, 6:28 am] Tom said: "Morning, Mara!"',
      ].join("\n"),
    );
    const empty = buildDecisionPrompt(buildContext({ stream: [] }));
    expect(empty).toContain(config.memory.streamTexts.empty);
  });

  it("has no section left from the old memory model", () => {
    const prompt = buildDecisionPrompt(buildContext());
    for (const title of ["On your mind", "Current conversation", "Memories", "Today's plan"]) {
      expect(prompt).not.toContain(title);
    }
    expect(prompt).not.toContain("stepDone");
    expect(prompt).not.toContain("recall");
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
          distanceTiles: 1,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
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
          distanceTiles: 3,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
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
          distanceTiles: null,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
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
          distanceTiles: null,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
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
          distanceTiles: null,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
        },
      ],
      normalHearerIds: ["bob", "clara"],
      whisperHearerIds: ["bob"],
    });
    expect(text).toBe(
      [
        "In sight, would hear you: Bob, next to you (kneading dough), Clara, a few steps away.",
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
          distanceTiles: null,
          healthAsSeen: "looks in poor shape",
          visibleCarried: [],
          visibleConditions: [],
        },
        {
          ...base,
          agentId: "mara",
          name: "Mara",
          doing: "lying dead",
          isDead: true,
          distanceTiles: null,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: [],
        },
      ],
      normalHearerIds: ["bob", "mara"],
      whisperHearerIds: [],
    });
    expect(text).toBe(
      [
        "In sight, would hear you: Bob, looks in poor shape (sitting).",
        "Also in sight: Mara's body.",
      ].join("\n"),
    );
  });

  it("shows the visible conditions of others and of bodies", () => {
    const base = { via: "saw" as const, place: "bakery", minutesAgo: 0, isInSight: true };
    const text = describeAroundYou({
      entries: [
        {
          ...base,
          agentId: "tobias",
          name: "Tobias",
          doing: "",
          isDead: false,
          distanceTiles: null,
          healthAsSeen: "looks in poor shape",
          visibleCarried: [],
          visibleConditions: ["bleeding"],
        },
        {
          ...base,
          agentId: "mara",
          name: "Mara",
          doing: "lying dead",
          isDead: true,
          distanceTiles: 9,
          healthAsSeen: null,
          visibleCarried: [],
          visibleConditions: ["on fire"],
        },
      ],
      normalHearerIds: ["tobias"],
      whisperHearerIds: [],
    });
    expect(text).toBe(
      [
        "In sight, would hear you: Tobias, looks in poor shape, bleeding.",
        "Also in sight: Mara's body, farther off, on fire.",
      ].join("\n"),
    );
  });

  it("says when no one is around", () => {
    expect(describeAroundYou({ entries: [], normalHearerIds: [], whisperHearerIds: [] })).toBe(
      "No one else is around.",
    );
  });
});

describe("places you have seen", () => {
  it("lists each seen place with what it held and when, and one not looked into by name alone", () => {
    const prompt = buildDecisionPrompt(buildContext());
    expect(prompt).toContain(
      [
        "## Places you have seen",
        "- bakery (in view now): oven, 2 bread",
        "- farm (as of Day 1, 6:10 am): nothing",
        "- town square",
        "",
      ].join("\n"),
    );
  });

  it("says so when no place has been seen", () => {
    const prompt = buildDecisionPrompt(buildContext({ seenPlaces: [] }));
    expect(prompt).toContain("## Places you have seen\nNone yet.");
  });
});

describe("buildCacheableDecisionPrompt", () => {
  it("puts what is the same for every agent before the first cache breakpoint", () => {
    const { text, cacheBreakpoints } = buildCacheableDecisionPrompt(buildContext());
    const [sharedEnd, perAgentEnd, placesEnd] = cacheBreakpoints;
    expect(cacheBreakpoints).toHaveLength(3);
    expect(text.slice(0, sharedEnd)).toContain("## What you can do");
    expect(text.slice(0, sharedEnd)).toContain("## Reply");
    expect(text.slice(0, sharedEnd)).not.toContain("## Who you are");
    expect(text.slice(sharedEnd, perAgentEnd)).toContain("## Goals");
    expect(text.slice(perAgentEnd, placesEnd)).toContain("## Places you have seen");
    expect(text.slice(placesEnd)).toContain("## Now");
    expect(text).not.toContain("<<<cache>>>");
  });

  it("keeps the shared part identical between mid-action interrupts and calm decisions", () => {
    const calm = buildCacheableDecisionPrompt(buildContext());
    const interrupted = buildCacheableDecisionPrompt(buildContext({ isMidActionInterrupt: true }));
    const sharedEnd = calm.cacheBreakpoints[0] ?? 0;
    expect(interrupted.text.slice(0, sharedEnd)).toBe(calm.text.slice(0, sharedEnd));
  });
});
