import type { PersonalityChange } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import {
  isReflectionDue,
  noteActDone,
  markRealityPassDone,
  noteAwakeTick,
  noteEpisodeMade,
  noteFailedAct,
  noteRepeatCount,
  noteStreamEntry,
  oweReflection,
} from "../../src/memory/reflection-progress";
import { createAgentMemory } from "../../src/memory/summaries";
import {
  applyIdentityChanges,
  applyPeopleChanges,
  describeRealityThought,
  EMPTY_PERSON_ENTRY,
} from "../../src/passes/apply-pass";
import { applyReflection } from "../../src/passes/apply-reflection";
import { buildReflectionReplySchema, type ReflectionReply } from "../../src/passes/reflection";
import {
  createTestSim,
  decisionReply,
  DEFAULT_PASS_REPLIES,
  DEFAULT_SUMMARY,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { getAgentMemory, replaceAgent } from "../../src/sim/world-access";
import { makeAgent } from "../economy/test-fixtures";

const OTHERS = [
  { id: "ilsa", name: "Ilsa" },
  { id: "bram", name: "Bram" },
];
const TICKS_PER_HOUR = 60 / config.clock.minutesPerTick;
const NO_CHANGE: ReflectionReply = {
  people: [],
  longTermGoals: null,
  traitChanges: [],
  profession: null,
  core: null,
  selfImage: null,
  voice: null,
  keyMemories: null,
  agenda: null,
};

function repeat<Value>(times: number, change: (value: Value) => Value, start: Value): Value {
  let value = start;
  for (let count = 0; count < times; count += 1) value = change(value);
  return value;
}

describe("when an agent reflects", () => {
  const fresh = createAgentMemory(1);

  it("owes nothing at the start", () => {
    expect(isReflectionDue(fresh, 0)).toBe(false);
  });

  it("reflects after enough hours awake once enough has happened", () => {
    const awake = repeat(config.reflection.everyHoursAwake * TICKS_PER_HOUR, noteAwakeTick, fresh);
    expect(isReflectionDue(awake, 0)).toBe(false);
    const busy = repeat(config.reflection.minNewEntries, noteStreamEntry, awake);
    expect(isReflectionDue(busy, 0)).toBe(true);
  });

  it("reflects when owed, but never within the least gap of the last", () => {
    const owed = oweReflection(fresh);
    expect(isReflectionDue(owed, 0)).toBe(true);
    const justReflected = { ...owed, reflection: { ...owed.reflection, lastTick: 100 } };
    expect(isReflectionDue(justReflected, 100 + config.reflection.minGapTicks - 1)).toBe(false);
    expect(isReflectionDue(justReflected, 100 + config.reflection.minGapTicks)).toBe(true);
  });

  it("owes a reality pass for a large repeat, or failures in a row, and not otherwise", () => {
    const signal = config.realityPass.repeatCountSignal;
    expect(noteRepeatCount(fresh, signal).isRealityPassOwed).toBe(true);
    expect(noteRepeatCount(fresh, signal - 1).isRealityPassOwed).toBe(false);
    const failures = config.realityPass.failureCountSignal;
    expect(repeat(failures, noteFailedAct, fresh).isRealityPassOwed).toBe(true);
    const interrupted = noteFailedAct(noteActDone(repeat(failures - 1, noteFailedAct, fresh)));
    expect(interrupted.isRealityPassOwed).toBe(false);
  });

  it("owes a reality pass every half of the episodes before a chronicle, counting from the last", () => {
    const interval = Math.floor(config.memory.episodesMax / config.realityPass.episodesMaxDivisor);
    expect(repeat(interval - 1, noteEpisodeMade, fresh).isRealityPassOwed).toBe(false);
    const owed = repeat(interval, noteEpisodeMade, fresh);
    expect(owed.isRealityPassOwed).toBe(true);
    const checked = markRealityPassDone(owed);
    expect(noteEpisodeMade(checked).isRealityPassOwed).toBe(false);
  });
});

describe("describeRealityThought", () => {
  it("files the thought in the agent's own voice", () => {
    const text = describeRealityThought({ noticed: "", thought: " Nobody can see a bite. " });
    expect(text).toBe(
      config.realityPass.thoughtStreamText.split("{thought}").join("Nobody can see a bite."),
    );
  });

  it("files nothing when the pass chose to say nothing", () => {
    expect(describeRealityThought({ noticed: "Doing fine.", thought: null })).toBeNull();
    expect(describeRealityThought({ noticed: "", thought: "  " })).toBeNull();
  });
});

describe("applyPeopleChanges", () => {
  const agent = makeAgent({
    people: {
      ilsa: { ...EMPTY_PERSON_ENTRY, whatIThinkOfThem: "Runs the square." },
      bram: { ...EMPTY_PERSON_ENTRY, whatIThinkOfThem: "Quiet." },
    },
  });

  it("rewrites only the people named, keeping the fields left out", () => {
    const updated = applyPeopleChanges(
      agent,
      [{ person: "ilsa", whatTheyThinkOfMe: "That I overcharge." }],
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
    const updated = applyPeopleChanges(
      agent,
      [
        { person: "Zed", whatIThinkOfThem: "A drifter." },
        { person: "Nobody", whatIThinkOfThem: "?" },
      ],
      stranger,
    );
    expect(updated.people).toEqual(agent.people);
  });
});

describe("applyIdentityChanges", () => {
  const agent = makeAgent();
  const unchanged = {
    traitChanges: [],
    profession: null,
    core: null,
    selfImage: null,
    voice: null,
  };

  it("moves a trait by at most the clamp and records the change with its reason", () => {
    const { agent: updated, changes } = applyIdentityChanges(
      agent,
      {
        ...unchanged,
        traitChanges: [{ trait: "openness", delta: 0.5, reason: "I tried a new recipe." }],
      },
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
    const same = applyIdentityChanges(agent, unchanged, 70);
    expect(same.agent).toEqual(agent);
    expect(same.changes).toEqual([]);
    const { agent: updated, changes } = applyIdentityChanges(
      agent,
      { ...unchanged, profession: "miller", selfImage: "restless", voice: "Curt now." },
      70,
    );
    expect(updated.profession).toBe("miller");
    expect(updated.personality.selfImage).toBe("restless");
    expect(updated.personality.core).toBe(agent.personality.core);
    expect(updated.personality.voice).toBe("Curt now.");
    expect(changes.map((change) => change.field)).toEqual(["profession", "selfImage", "voice"]);
  });
});

describe("the reflection's reply", () => {
  const { schema } = buildReflectionReplySchema();

  it("reads null as no change, and drops a person's null fields", () => {
    const parsed = schema.parse({
      ...NO_CHANGE,
      people: [{ person: "Ilsa", whatIThinkOfThem: "Fair.", whatTheyThinkOfMe: null }],
    });
    expect(parsed).toEqual({
      ...NO_CHANGE,
      people: [{ person: "Ilsa", whatIThinkOfThem: "Fair." }],
    });
  });

  it("rejects more long-term goals than allowed and keeps no more key memories than allowed", () => {
    const goal = { goal: "Sell bread", reason: "coins", progress: "" };
    const tooManyGoals = Array.from({ length: config.goals.maxLongTerm + 1 }, () => goal);
    expect(schema.safeParse({ ...NO_CHANGE, longTermGoals: tooManyGoals }).success).toBe(false);
    const memories = Array.from({ length: config.memory.keyMemoriesMax + 2 }, (_unused, index) => ({
      day: 1,
      text: `moment ${index}`,
    }));
    const parsed = schema.parse({ ...NO_CHANGE, keyMemories: memories });
    expect(parsed.keyMemories).toHaveLength(config.memory.keyMemoriesMax);
  });
});

describe("applyReflection", () => {
  const agent = makeAgent({
    agenda: [{ number: 1, text: "Bake", hour: null }],
    nextAgendaNumber: 2,
  });
  const candidate = { day: 1, text: "Ilsa told me her secret." };
  const memory = { ...createAgentMemory(1), keyMemoryCandidates: [candidate] };
  const asked = { agendaRevision: agent.agendaRevision, candidates: [candidate] };

  it("keeps the key memories it chose and lets the other moments it saw go", () => {
    const later = { day: 1, text: "Bram left town." };
    const reflected = applyReflection(
      agent,
      { ...memory, keyMemoryCandidates: [candidate, later] },
      { ...NO_CHANGE, keyMemories: [candidate] },
      asked,
      OTHERS,
      50,
    );
    expect(reflected.memory.keyMemories).toEqual([candidate]);
    expect(reflected.memory.keyMemoryCandidates).toEqual([later]);
    expect(reflected.memory.reflection).toMatchObject({ lastTick: 50, isOwed: false });
  });

  it("rewrites the rest of today only if nothing changed it while the reflection ran", () => {
    const agenda = [{ text: "Find Bram", hour: null }];
    const current = applyReflection(agent, memory, { ...NO_CHANGE, agenda }, asked, OTHERS, 50);
    expect(current.agent.agenda.map((item) => item.text)).toEqual(["Find Bram"]);
    const changed = { ...agent, agendaRevision: agent.agendaRevision + 1 };
    const stale = applyReflection(changed, memory, { ...NO_CHANGE, agenda }, asked, OTHERS, 50);
    expect(stale.agent.agenda).toEqual(agent.agenda);
  });
});

describe("reflections and reality passes in the sim", () => {
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

  it("reflects when owed, recording changes and moments", async () => {
    const changes: Omit<PersonalityChange, "id">[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      recordPersonalityChange: (change) => changes.push(change),
      responder: (request) => {
        if (request.schemaName === "reflection_reply") {
          return JSON.stringify({
            ...NO_CHANGE,
            traitChanges: [{ trait: "openness", delta: 0.003, reason: "I tried something new." }],
            longTermGoals: [{ goal: "Open a stall", reason: "More buyers", progress: "" }],
          });
        }
        const passReply = DEFAULT_PASS_REPLIES[request.schemaName ?? ""];
        if (passReply !== undefined) return JSON.stringify(passReply);
        return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
      },
    });
    sim.state.agentMemories.mara = oweReflection(getAgentMemory(sim.state, "mara"));
    const opennessBefore = sim.agent("mara").personality.traits.openness;
    const [result] = await sim.advance();
    expect(sim.records.map((record) => record.kind)).toEqual(["decision", "reflection"]);
    expect(sim.records[1]?.prompt).toContain("## The question: taking stock");
    expect(sim.agent("mara").personality.traits.openness).toBeCloseTo(opennessBefore + 0.003);
    expect(sim.agent("mara").longTermGoals.map((goal) => goal.goal)).toEqual(["Open a stall"]);
    expect(changes.map((change) => change.field)).toEqual(["openness"]);
    const momentKinds = result?.moments.map((moment) => moment.kind) ?? [];
    expect(momentKinds).toEqual(expect.arrayContaining(["personality_changed", "goal_added"]));
    expect(getAgentMemory(sim.state, "mara").reflection.isOwed).toBe(false);
  });

  function createRealitySim(thought: string | null) {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request) => {
        if (request.schemaName === "reality_reply") {
          return JSON.stringify({ noticed: "Checking arms for marks.", thought });
        }
        const passReply = DEFAULT_PASS_REPLIES[request.schemaName ?? ""];
        if (passReply !== undefined) return JSON.stringify(passReply);
        if (request.schemaName?.endsWith("_reply") && request.schemaName !== "decision_reply") {
          return JSON.stringify({ summary: DEFAULT_SUMMARY });
        }
        return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
      },
    });
    sim.state.agentMemories.mara = {
      ...getAgentMemory(sim.state, "mara"),
      isRealityPassOwed: true,
    };
    return sim;
  }

  it("files the reality pass's thought in the stream, and owes it no more", async () => {
    const sim = createRealitySim("Nobody can see a bite under a sleeve.");
    await sim.advance();
    expect(sim.records.map((record) => record.kind)).toContain("reality");
    expect(sim.streamTexts("mara")).toContain(
      describeRealityThought({ noticed: "", thought: "Nobody can see a bite under a sleeve." }),
    );
    expect(getAgentMemory(sim.state, "mara").isRealityPassOwed).toBe(false);
  });

  it("gives the reality pass the world's rules and places, and no one else's opening", async () => {
    const sim = createRealitySim(null);
    await sim.advance();
    const prompt = sim.records.find((record) => record.kind === "reality")?.prompt ?? "";
    expect(prompt).toContain("- chopping block: cut planks (uses 1 wood; makes 2 planks)");
    expect(prompt).toContain(sim.state.map.places[0]?.name ?? "no place");
    expect(prompt).not.toContain(`You are ${sim.agent("mara").name}.`);
    expect(prompt).toContain("## Just now");
  });

  it("leaves a failed reflection owed and tries it again later", async () => {
    let shouldFail = true;
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request) => {
        if (request.schemaName !== "reflection_reply") {
          return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
        }
        return shouldFail ? "not json" : JSON.stringify(NO_CHANGE);
      },
    });
    sim.state.agentMemories.mara = oweReflection(getAgentMemory(sim.state, "mara"));
    await sim.advance();
    expect(getAgentMemory(sim.state, "mara").reflection.isOwed).toBe(true);
    shouldFail = false;
    await sim.advance(config.memory.retryAfterTicks);
    expect(getAgentMemory(sim.state, "mara").reflection.isOwed).toBe(false);
  });
});
