import type { PersonalityChange } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { makeAgent } from "../economy/test-fixtures";
import { createAgentMemory, findDuePass, markPassDone } from "../../src/memory/summaries";
import {
  createTestSim,
  decisionReply,
  DEFAULT_PASS_REPLIES,
  DEFAULT_SUMMARY,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { getAgentMemory, replaceAgent } from "../../src/sim/world-access";
import {
  applyIdentityReply,
  applyPeopleReply,
  EMPTY_PERSON_ENTRY,
} from "../../src/passes/apply-pass";
import { buildPassReplySchema, findPassSchemaName } from "../../src/passes/pass-prompts";

const OTHERS = [
  { id: "ilsa", name: "Ilsa" },
  { id: "bram", name: "Bram" },
];

describe("what is due", () => {
  const settled = markPassDone(createAgentMemory(1), "shortTermGoals");

  it("owes the short-term goals pass once at the start", () => {
    expect(findDuePass(createAgentMemory(1))).toBe("shortTermGoals");
    expect(findDuePass(settled)).toBeNull();
  });

  it("owes the people pass, then the short-term goals pass, after enough new episodes", () => {
    const passes = {
      ...settled.passes,
      episodesSincePeople: config.people.everyEpisodes,
      episodesSinceShortTermGoals: config.goals.shortTermEveryEpisodes,
    };
    const due = { ...settled, passes };
    expect(findDuePass(due)).toBe("people");
    const afterPeople = markPassDone(due, "people");
    expect(findDuePass(afterPeople)).toBe("shortTermGoals");
    expect(findDuePass(markPassDone(afterPeople, "shortTermGoals"))).toBeNull();
  });

  it("puts identity and long-term goals first once a chronicle has formed", () => {
    const passes = {
      ...settled.passes,
      isIdentityOwed: true,
      isLongTermGoalsOwed: true,
      episodesSincePeople: config.people.everyEpisodes,
    };
    const order: string[] = [];
    let memory = { ...settled, passes };
    for (let pass = findDuePass(memory); pass !== null; pass = findDuePass(memory)) {
      order.push(pass);
      memory = markPassDone(memory, pass);
    }
    expect(order).toEqual(["identity", "longTermGoals", "people"]);
  });
});

describe("applyPeopleReply", () => {
  const agent = makeAgent({
    people: {
      ilsa: { ...EMPTY_PERSON_ENTRY, whatIThinkOfThem: "Runs the square." },
      bram: { ...EMPTY_PERSON_ENTRY, whatIThinkOfThem: "Quiet." },
    },
  });

  it("rewrites only the people named, keeping the fields left null", () => {
    const updated = applyPeopleReply(
      agent,
      { people: [{ person: "ilsa", whatTheyThinkOfMe: "That I overcharge." }] },
      OTHERS,
    );
    expect(updated.people.ilsa).toEqual({
      ...EMPTY_PERSON_ENTRY,
      whatIThinkOfThem: "Runs the square.",
      whatTheyThinkOfMe: "That I overcharge.",
    });
    expect(updated.people.bram).toBe(agent.people.bram);
  });

  it("ignores a name with no person entry", () => {
    const stranger = [...OTHERS, { id: "zed", name: "Zed" }];
    const updated = applyPeopleReply(
      agent,
      {
        people: [
          { person: "Zed", whatIThinkOfThem: "A drifter." },
          { person: "Nobody", whatIThinkOfThem: "?" },
        ],
      },
      stranger,
    );
    expect(updated.people).toEqual(agent.people);
  });
});

describe("applyIdentityReply", () => {
  const agent = makeAgent();

  it("moves a trait by at most the clamp and records the change with its reason", () => {
    const { agent: updated, changes } = applyIdentityReply(
      agent,
      { traitChanges: [{ trait: "openness", delta: 0.5, reason: "I tried a new recipe." }] },
      70,
    );
    expect(updated.personality.traits.openness).toBe(config.traits.passDeltaClamp);
    expect(changes).toEqual([
      {
        agentId: agent.id,
        tick: 70,
        field: "openness",
        oldValue: "0",
        newValue: String(config.traits.passDeltaClamp),
        reason: "I tried a new recipe.",
      },
    ]);
  });

  it("changes profession, core and self-image only when given, and nothing otherwise", () => {
    const unchanged = applyIdentityReply(agent, { traitChanges: [] }, 70);
    expect(unchanged.agent).toEqual(agent);
    expect(unchanged.changes).toEqual([]);
    const { agent: updated, changes } = applyIdentityReply(
      agent,
      { traitChanges: [], profession: "miller", selfImage: "restless" },
      70,
    );
    expect(updated.profession).toBe("miller");
    expect(updated.personality.selfImage).toBe("restless");
    expect(updated.personality.core).toBe(agent.personality.core);
    expect(changes.map((change) => change.field)).toEqual(["profession", "selfImage"]);
  });
});

describe("pass reply schemas", () => {
  it("rejects more goals or steps than allowed and text well past its limit", () => {
    const { schema } = buildPassReplySchema("shortTermGoals");
    const goal = { goal: "Sell bread", reason: "coins", steps: ["go"], progress: "" };
    expect(schema.safeParse({ goals: [goal] }).success).toBe(true);
    const tooManyGoals = Array.from({ length: config.goals.maxShortTerm + 1 }, () => goal);
    expect(schema.safeParse({ goals: tooManyGoals }).success).toBe(false);
    const tooManySteps = Array.from({ length: config.goals.maxSteps + 1 }, () => "go");
    expect(schema.safeParse({ goals: [{ ...goal, steps: tooManySteps }] }).success).toBe(false);
    const tooLong = "x".repeat(config.goals.shortTermFieldMaxChars * 2);
    expect(schema.safeParse({ goals: [{ ...goal, goal: tooLong }] }).success).toBe(false);
  });

  it("drops null fields of a person so they keep what was held", () => {
    const { schema } = buildPassReplySchema("people");
    const parsed = schema.parse({
      people: [
        {
          person: "Ilsa",
          whatIThinkOfThem: "Fair.",
          whatTheyThinkOfMe: null,
          whatIWantFromThem: null,
          whatTheyWantFromMe: null,
        },
      ],
    });
    expect(parsed.people).toEqual([{ person: "Ilsa", whatIThinkOfThem: "Fair." }]);
  });
});

describe("passes in the sim", () => {
  const SQUARE = { x: 19, y: 15 };

  it("gives someone seen for the first time an empty person entry", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    replaceAgent(sim.state, { ...sim.agent("mara"), people: {} });
    sim.placeAgent("mara", { x: 5, y: 4 });
    sim.placeAgent("ilsa", { x: 30, y: 26 });
    await sim.advance();
    expect(sim.agent("mara").people).toEqual({});
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y });
    await sim.advance();
    expect(sim.agent("mara").people).toEqual({ ilsa: EMPTY_PERSON_ENTRY });
  });

  it("runs the short-term goals pass once at tick 0 and shows its goals to the next decision", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      shouldRunFirstGoalsPass: true,
      responder: (request) => {
        if (request.schemaName !== findPassSchemaName("shortTermGoals")) {
          return decisionReply({ action: "wait", minutes: 1 });
        }
        return JSON.stringify({
          goals: [
            { goal: "Bake bread", reason: "to sell", steps: ["light the oven"], progress: "" },
          ],
        });
      },
    });
    await sim.advance();
    expect(sim.records.map((record) => record.kind)).toEqual(["decision", "short_term_goals"]);
    expect(sim.agent("mara").shortTermGoals).toEqual([
      { goal: "Bake bread", reason: "to sell", steps: ["light the oven"], progress: "" },
    ]);
    const passPrompt = sim.records[1]?.prompt ?? "";
    expect(passPrompt.indexOf("## Just now")).toBeLessThan(passPrompt.indexOf("## Who you are"));
    expect(passPrompt).toContain("## The question: your short-term goals");
    await sim.advance(3);
    expect(sim.records.filter((record) => record.kind === "short_term_goals")).toHaveLength(1);
    expect(sim.records.at(-1)?.prompt).toContain("- Bake bread (why: to sell; so far: )");
  });

  it("runs identity then long-term goals when a chronicle forms, recording changes and moments", async () => {
    const changes: Omit<PersonalityChange, "id">[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      recordPersonalityChange: (change) => changes.push(change),
      responder: (request) => {
        const schemaName = request.schemaName ?? "";
        if (schemaName === findPassSchemaName("identity")) {
          return JSON.stringify({
            traitChanges: [{ trait: "openness", delta: 0.003, reason: "I tried something new." }],
            profession: null,
            core: null,
            selfImage: null,
          });
        }
        if (schemaName === findPassSchemaName("longTermGoals")) {
          return JSON.stringify({
            goals: [{ goal: "Open a stall", reason: "More buyers", progress: "" }],
          });
        }
        const passReply = DEFAULT_PASS_REPLIES[schemaName];
        if (passReply !== undefined) return JSON.stringify(passReply);
        if (schemaName.endsWith("_reply") && schemaName !== "decision_reply") {
          return JSON.stringify({ summary: DEFAULT_SUMMARY });
        }
        return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
      },
    });
    await sim.advance();
    const episodes = Array.from({ length: config.memory.episodesMax }, (_unused, index) => ({
      level: "episode" as const,
      startTick: index,
      endTick: index,
      text: `episode ${index}`,
    }));
    sim.state.agentMemories.mara = { ...getAgentMemory(sim.state, "mara"), episodes };
    const opennessBefore = sim.agent("mara").personality.traits.openness;
    sim.records.length = 0;
    const [result] = await sim.advance();
    expect(sim.records.map((record) => record.kind)).toEqual([
      "chronicle",
      "identity",
      "long_term_goals",
    ]);
    expect(sim.agent("mara").personality.traits.openness).toBeCloseTo(opennessBefore + 0.003);
    expect(sim.agent("mara").longTermGoals.map((goal) => goal.goal)).toEqual(["Open a stall"]);
    expect(changes.map((change) => change.field)).toEqual(["openness"]);
    const momentKinds = result?.moments.map((moment) => moment.kind) ?? [];
    expect(momentKinds).toContain("personality_changed");
    expect(momentKinds).toContain("goal_added");
    expect(momentKinds).toContain("goal_removed");
    expect(getAgentMemory(sim.state, "mara").passes).toMatchObject({
      isIdentityOwed: false,
      isLongTermGoalsOwed: false,
    });
  });

  it("leaves a failed pass owed and tries it again later", async () => {
    let shouldFail = true;
    const sim = createTestSim({
      agentIds: ["mara"],
      shouldRunFirstGoalsPass: true,
      responder: (request) => {
        if (request.schemaName !== findPassSchemaName("shortTermGoals")) {
          return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
        }
        return shouldFail ? "not json" : JSON.stringify({ goals: [] });
      },
    });
    await sim.advance();
    expect(getAgentMemory(sim.state, "mara").passes.isFirstShortTermGoalsOwed).toBe(true);
    shouldFail = false;
    await sim.advance(config.memory.retryAfterTicks);
    expect(getAgentMemory(sim.state, "mara").passes.isFirstShortTermGoalsOwed).toBe(false);
  });
});
