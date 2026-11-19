import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { PlayerInbox } from "../../src/sim/player-inbox";
import { decisionReply, promptOf } from "../../src/sim/test-sim";
import { countCarried, createPlayedSim, findTileBesideWall, SQUARE } from "./player-test-kit";

const { refusals } = config.player;

describe("the player's acts", () => {
  it("says the player's words and starts their act, as the agent's own decision", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara", "ilsa"]);
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y });
    playAs("mara");
    choose({ action: "wait", say: "Morning, Ilsa" });
    await sim.advance(1);
    expect(sim.streamTexts("ilsa")).toContain('I overheard Mara say: "Morning, Ilsa"');
    expect(sim.streamTexts("mara")).toContain('I said: "Morning, Ilsa"');
    expect(sim.agent("mara").currentAction?.kind).toBe("wait");
  });

  it("carries out one waiting act per tick, oldest first", async () => {
    const { sim, inbox, playAs, choose } = createPlayedSim(["mara"]);
    sim.placeAgent("mara", SQUARE);
    playAs("mara");
    choose({ action: "wait", minutes: 1, say: "First" });
    choose({ action: "wait", minutes: 1, say: "Second" });
    await sim.advance(1);
    expect(inbox.list("mara")).toHaveLength(1);
    await sim.advance(1);
    const spoken = sim.results
      .flatMap((result) => result.events)
      .flatMap((event) => (event.speech === undefined ? [] : [event.speech.words]));
    expect(spoken).toEqual(["First", "Second"]);
  });

  it("turns an act down once too many are waiting", () => {
    const { playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    for (let count = 0; count < config.player.maxPendingActs; count += 1) {
      expect(choose({ action: "wait", minutes: 5 })).toBeNull();
    }
    expect(choose({ action: "wait", minutes: 5 })).toBe(refusals.tooManyActs);
  });

  it("turns down every act while nobody is played", () => {
    const { choose } = createPlayedSim(["mara"]);
    expect(choose({ action: "wait" })).toBe(refusals.notPlaying);
  });

  it("moves one tile a tick, announced to no one", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara", "ilsa"]);
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 2, y: SQUARE.y });
    playAs("mara");
    expect(choose({ action: "move", pos: { x: SQUARE.x - 1, y: SQUARE.y } })).toBeNull();
    await sim.advance(1);
    expect(sim.agent("mara").pos).toEqual({ x: SQUARE.x - 1, y: SQUARE.y });
    const walkEvents = sim.results
      .flatMap((result) => result.events)
      .filter((event) => event.actorId === "mara" && event.kind.startsWith("walk"));
    expect(walkEvents).toEqual([]);
    expect(sim.streamTexts("ilsa").some((text) => text.includes("Mara"))).toBe(false);
  });

  it("keeps only the newest of two moves still waiting, so a held key can't run ahead", () => {
    const inbox = new PlayerInbox();
    inbox.put("mara", { action: "move", pos: { x: 1, y: 0 } });
    inbox.put("mara", { action: "move", pos: { x: 2, y: 0 } });
    expect(inbox.list("mara")).toEqual([{ action: "move", pos: { x: 2, y: 0 } }]);
  });

  it("turns down a move that isn't next to the agent, goes into a wall or onto someone", () => {
    const { sim, playAs, choose } = createPlayedSim(["mara", "ilsa"]);
    const { standOn, wall } = findTileBesideWall(sim);
    sim.placeAgent("mara", standOn);
    sim.placeAgent("ilsa", { x: standOn.x - 1, y: standOn.y });
    playAs("mara");
    const moveTo = (pos: { x: number; y: number }) => choose({ action: "move", pos });
    expect(moveTo({ x: standOn.x + 2, y: standOn.y })).toBe(refusals.moveNotNextTo);
    expect(moveTo(wall)).toBe(refusals.moveIntoWall);
    expect(moveTo({ x: standOn.x - 1, y: standOn.y })).toBe(refusals.moveIntoSomeone);
  });

  it("walks to a tile picked on the map, setting off where others can see", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    sim.placeAgent("mara", SQUARE);
    playAs("mara");
    const destination = { x: SQUARE.x + 3, y: SQUARE.y };
    choose({ action: "walk_to", pos: destination });
    await sim.advance(5);
    expect(sim.agent("mara").pos).toEqual(destination);
    const kinds = sim.results
      .flatMap((result) => result.events)
      .filter((event) => event.actorId === "mara")
      .map((event) => event.kind);
    expect(kinds).toEqual(expect.arrayContaining(["walk_started", "arrived"]));
  });

  it("does a verb the player picked, with no second LLM call to settle it", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    choose({ action: "interact", verb: "eat", item: "bread" });
    await sim.advance(40);
    expect(countCarried(sim, "mara", "bread")).toBe(1);
    expect(sim.records.filter((record) => record.kind === "interact")).toEqual([]);
  });

  it("accepts what someone offers the player, when the player says so", async () => {
    let hasOffered = false;
    const { sim, playAs, choose } = createPlayedSim(["mara", "ilsa"], {
      Ilsa: () => {
        if (hasOffered) return undefined;
        hasOffered = true;
        return decisionReply({ action: "give", target: "Mara", item: "bread", amount: 1 });
      },
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y });
    playAs("mara");
    await sim.advance(1);
    const offer = getAgentRuntime(sim.state, "mara").pendingOffer;
    expect(offer).not.toBeNull();
    choose({ action: "continue", offer: { eventId: offer?.eventId ?? 0, answer: "accept" } });
    await sim.advance(1);
    expect(countCarried(sim, "mara", "bread")).toBe(3);
    expect(countCarried(sim, "ilsa", "bread")).toBe(1);
  });

  it("offers what the player gives, for the other agent to answer", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara", "ilsa"], {
      Ilsa: (request) =>
        promptOf(request).includes("Mara is offering you")
          ? decisionReply({ action: "wait", minutes: 30, offer: "accept" })
          : undefined,
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y });
    playAs("mara");
    choose({ action: "give", target: "Ilsa", item: "bread", amount: 1 });
    await sim.advance(3);
    expect(countCarried(sim, "ilsa", "bread")).toBe(3);
    expect(countCarried(sim, "mara", "bread")).toBe(1);
  });
});
