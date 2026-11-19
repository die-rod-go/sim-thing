import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { buildPlayerView, findPlayerHearing } from "../../src/sim/player-view";
import { decisionReply } from "../../src/sim/test-sim";
import { findAgent, replaceAgent } from "../../src/sim/world-access";
import { createPlayedSim, SQUARE } from "./player-test-kit";

describe("what the player sees of their agent", () => {
  it("is nothing while nobody is played", () => {
    const { sim, inbox } = createPlayedSim(["mara"]);
    expect(buildPlayerView(sim.state, inbox)).toBeNull();
  });

  it("says it is the player's turn, and why, until an act is waiting", () => {
    const { sim, inbox, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    expect(buildPlayerView(sim.state, inbox)).toMatchObject({
      agentId: "mara",
      isYourTurn: true,
      turnReason: config.player.takeOverReason,
    });
    choose({ action: "wait", say: "Hello" });
    expect(buildPlayerView(sim.state, inbox)).toMatchObject({
      isYourTurn: false,
      pendingActs: ['wait 5 min, saying "Hello"'],
    });
  });

  it("lists what the agent carries with each thing it can do, ready to send back", () => {
    const { sim, inbox, playAs } = createPlayedSim(["mara"]);
    playAs("mara");
    const bread = buildPlayerView(sim.state, inbox)?.carrying.find(
      (thing) => thing.name === "bread",
    );
    expect(bread).toMatchObject({ text: "2 bread", count: 2 });
    expect(bread?.options).toContainEqual({
      label: "eat",
      verb: "eat",
      item: "bread",
      from: null,
      targets: null,
      takes: [],
    });
    const thrown = bread?.options.find((option) => option.verb === "throw");
    expect(thrown?.targets).toEqual(expect.any(Array));
  });

  it("lists everyone in sight, nearest first, with who is in reach and who would hear", async () => {
    const { sim, inbox, playAs } = createPlayedSim(["mara", "ilsa", "bram"]);
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y });
    sim.placeAgent("bram", { x: SQUARE.x + 4, y: SQUARE.y });
    playAs("mara");
    await sim.advance(1);
    const people = buildPlayerView(sim.state, inbox)?.people ?? [];
    expect(people.map((person) => person.name)).toEqual(["Ilsa", "Bram"]);
    expect(people[0]).toMatchObject({ isInReach: true, canHearYou: true, isDead: false });
    expect(people[1]).toMatchObject({ isInReach: false, canHearYou: true });
  });

  it("shows the agent's stream as its journal, and what it can see", async () => {
    const { sim, inbox, playAs, choose } = createPlayedSim(["mara"]);
    sim.placeAgent("mara", SQUARE);
    playAs("mara");
    choose({ action: "wait", say: "Anyone about?" });
    await sim.advance(1);
    const view = buildPlayerView(sim.state, inbox);
    expect(view?.journal.some((entry) => entry.includes("Anyone about?"))).toBe(true);
    const ownTile = SQUARE.y * sim.state.map.grid.width + SQUARE.x;
    expect(view?.visibleTiles).toContain(ownTile);
  });

  it("shows only the journal once the agent is dead", () => {
    const { sim, inbox, playAs } = createPlayedSim(["mara"]);
    playAs("mara");
    const mara = findAgent(sim.state, "mara");
    replaceAgent(sim.state, { ...mara, death: { tick: 0, cause: "starved", sourceId: null } });
    expect(buildPlayerView(sim.state, inbox)).toMatchObject({
      isDead: true,
      isYourTurn: false,
      here: [],
      people: [],
    });
  });
});

describe("how the player heard what was said", () => {
  it("is clear up close, nothing far off, and null while nobody is played", async () => {
    let hasSpoken = false;
    const { sim, playAs } = createPlayedSim(["mara", "ilsa", "bram"], {
      Ilsa: () => {
        if (hasSpoken) return undefined;
        hasSpoken = true;
        return decisionReply({ action: "wait", minutes: 30, say: "Fine weather" });
      },
    });
    sim.placeAgent("ilsa", SQUARE);
    sim.placeAgent("mara", { x: SQUARE.x + 1, y: SQUARE.y });
    sim.placeAgent("bram", { x: 3, y: 26 });
    const [result] = await sim.advance(1);
    const said = result?.events.find((event) => event.kind === "said");
    if (said === undefined) throw new Error("Ilsa said nothing");
    expect(findPlayerHearing(sim.state, said)).toBeNull();
    playAs("mara");
    expect(findPlayerHearing(sim.state, said)).toBe("clear");
    playAs("bram");
    expect(findPlayerHearing(sim.state, said)).toBe("none");
  });
});
