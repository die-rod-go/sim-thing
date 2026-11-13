import { describe, expect, it } from "vitest";
import { startSleep } from "../economy/sleep";
import { addComponent } from "../items/thing-writes";
import { findEntityIfPresent, getDefinition } from "../items/entity-store";
import { tileIndex } from "../world/types";
import { getAgentRuntime } from "./agent-runtime";
import {
  BESIDE_SQUARE,
  NEXT_TO_SQUARE,
  SQUARE,
  aimWith,
  buildCombatSim,
  contextOf,
  entityThing,
  finish,
  fixRolls,
  handOver,
  memoryTexts,
  place,
  readFieldOf,
  readHealth,
  setAgentHealth,
  setField,
} from "./combat-test-kit";
import { findEntityByLabel, type TestSim } from "./test-sim";
import { buildPerceptionWorld, replaceAgent } from "./world-access";

const ALWAYS_HIT = 0;
const ALWAYS_MISS = 0.99;

function stabTobias(sim: TestSim, roll: number) {
  const knife = handOver(sim, "mara", "knife");
  fixRolls(sim, roll);
  aimWith(sim, "mara", knife, "attack", "Tobias");
  return { knife, finished: finish(sim, "mara") };
}

function setUp(agentIds = ["mara", "tobias"]): TestSim {
  const sim = buildCombatSim(agentIds);
  const positions = { mara: SQUARE, tobias: NEXT_TO_SQUARE, ilsa: BESIDE_SQUARE };
  place(
    sim,
    Object.fromEntries(Object.entries(positions).filter(([agentId]) => agentIds.includes(agentId))),
  );
  return sim;
}

describe("attacking someone", () => {
  it("lowers the target's health on a hit, scaled by the attacker's strength", () => {
    const sim = setUp();
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      body: { ...sim.agent("mara").body, strength: 1 },
    });
    const { finished } = stabTobias(sim, ALWAYS_HIT);
    expect(readHealth(sim, "tobias")).toBeCloseTo(1 - 0.2 * 1.3, 9);
    const hit = finished.result.events.find((event) => event.kind === "attacked");
    expect(hit?.description).toBe("hit Tobias with a knife");
  });

  it("does no damage on a miss but still wears the weapon", () => {
    const sim = setUp();
    const { knife, finished } = stabTobias(sim, ALWAYS_MISS);
    expect(readHealth(sim, "tobias")).toBe(1);
    expect(readFieldOf(sim, entityThing(knife), "health.current")).toBeCloseTo(4 - 0.02, 9);
    const missed = finished.result.events.find((event) => event.kind === "missed");
    expect(missed?.description).toBe("swung a knife at Tobias and missed");
  });

  it("gives the target an urgent decision on a hit or a miss", () => {
    const sim = setUp();
    stabTobias(sim, ALWAYS_MISS);
    expect(getAgentRuntime(sim.state, "tobias").pendingDecision).toEqual({
      reason: "Mara attacked me",
      isUrgent: true,
    });
  });

  it("gives witnesses a decision that skips the interrupt cooldown", () => {
    const sim = setUp(["mara", "tobias", "ilsa"]);
    stabTobias(sim, ALWAYS_HIT);
    expect(getAgentRuntime(sim.state, "ilsa").pendingDecision).toEqual({
      reason: "I saw Mara attack Tobias",
      isUrgent: true,
    });
  });

  it("files the act for the attacker, the target and witnesses", () => {
    const sim = setUp(["mara", "tobias", "ilsa"]);
    stabTobias(sim, ALWAYS_HIT);
    expect(memoryTexts(sim, "mara")).toContain("I hit Tobias with a knife");
    expect(memoryTexts(sim, "tobias")).toContain("Mara hit me with a knife");
    expect(memoryTexts(sim, "ilsa")).toContain("I saw that Mara hit Tobias with a knife");
  });

  it("names the death after the attack's killed phrase and the attacker", () => {
    const sim = setUp();
    setAgentHealth(sim, "tobias", 0.05);
    stabTobias(sim, ALWAYS_HIT);
    expect(sim.agent("tobias").death?.cause).toBe("killed by Mara with a knife");
    expect(sim.agent("tobias").death?.sourceAgentId).toBe("mara");
  });

  it("always hits a sleeper, who wakes hurt without perceiving the attacker", () => {
    const sim = setUp();
    const slept = startSleep(sim.agent("tobias"), "grass", sim.state.tick);
    if (!slept.isSuccess) throw new Error(slept.reason);
    replaceAgent(sim.state, { ...slept.agent, body: { ...slept.agent.body, agility: 1 } });
    const memoriesBefore = memoryTexts(sim, "tobias");
    stabTobias(sim, ALWAYS_MISS);
    const newMemories = memoryTexts(sim, "tobias").filter((text) => !memoriesBefore.includes(text));
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
    expect(sim.agent("tobias").currentAction).toBeNull();
    expect(newMemories.some((text) => text.includes("Mara"))).toBe(false);
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I woke up in pain/);
  });

  it("can't be aimed at the dead", () => {
    const sim = setUp();
    setAgentHealth(sim, "tobias", 0);
    replaceAgent(sim.state, {
      ...sim.agent("tobias"),
      death: { tick: 0, cause: "starved", sourceAgentId: null },
    });
    const knife = handOver(sim, "mara", "knife");
    aimWith(sim, "mara", knife, "attack", "Tobias's body");
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toBe(
      "I tried to attack Tobias's body with a knife but that doesn't work on Tobias's body",
    );
  });
});

describe("breaking things", () => {
  it("destroys a door without a broken form once its health runs out, so it no longer blocks sight", () => {
    const sim = setUp(["mara"]);
    const door = findEntityByLabel(sim.state, "bakery door");
    if (door.location.kind !== "tile") throw new Error("the door isn't placed");
    const doorTile = tileIndex(sim.state.map.grid, door.location.pos);
    addComponent(contextOf(sim), entityThing(door), "closed", {
      minutes: null,
    });
    setField(sim, entityThing(door), "health.current", 0.01);
    sim.placeAgent("mara", { x: door.location.pos.x, y: door.location.pos.y + 1 });
    expect(buildPerceptionWorld(sim.state).sightBlockingTiles.has(doorTile)).toBe(true);
    const knife = handOver(sim, "mara", "knife");
    fixRolls(sim, ALWAYS_MISS);
    aimWith(sim, "mara", knife, "attack", "bakery door");
    const finished = finish(sim, "mara");
    expect(findEntityIfPresent(sim.state, door.id)).toBeUndefined();
    expect(buildPerceptionWorld(sim.state).sightBlockingTiles.has(doorTile)).toBe(false);
    expect(finished.result.events.filter((event) => event.kind === "announced")).toContainEqual(
      expect.objectContaining({ actorName: "the bakery door", description: "broke" }),
    );
  });

  it("turns a knife worn to nothing into a broken knife, seen as it breaking", () => {
    const sim = setUp();
    const knife = handOver(sim, "mara", "knife");
    setField(sim, entityThing(knife), "health.current", 0.001);
    fixRolls(sim, ALWAYS_MISS);
    aimWith(sim, "mara", knife, "attack", "Tobias");
    const finished = finish(sim, "mara");
    expect(finished.result.events).toContainEqual(
      expect.objectContaining({
        kind: "announced",
        actorName: "Mara's knife",
        description: "broke",
        holderId: "mara",
      }),
    );
    const broken = findEntityIfPresent(sim.state, knife.id);
    expect(broken && getDefinition(sim.state, broken).id).toBe("broken_knife");
    expect(broken?.location).toEqual({ kind: "inside", holderId: "mara" });
  });
});
