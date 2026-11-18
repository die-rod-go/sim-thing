import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { countHeld, createEntity } from "../../src/items/entity-store";
import { addComponent } from "../../src/items/thing-writes";
import type { LlmRequest } from "../../src/llm/types";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { makeOffer } from "../../src/sim/offers";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { contextOf, entityThing } from "./combat-test-kit";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_SQUARE = { x: SQUARE.x + 1, y: SQUARE.y };
const OFFER_LINE = "Mara is offering you 3 coins";

type TestSim = ReturnType<typeof createTestSim>;

/** Mara offers Ilsa 3 coins first thing; Ilsa answers any offer she is shown with `answer`. */
function createOfferSim(answer: Record<string, unknown>, agentIds = ["mara", "ilsa"]): TestSim {
  const sim = createTestSim({
    agentIds,
    responder: scriptByAgent({
      Mara: (_request, callIndex) =>
        callIndex === 0
          ? decisionReply({ action: "give", target: "Ilsa", item: "coins", amount: 3 })
          : undefined,
      Ilsa: (request: LlmRequest) =>
        promptOf(request).includes(OFFER_LINE)
          ? decisionReply({ action: "continue", ...answer })
          : undefined,
    }),
  });
  sim.placeAgent("mara", SQUARE);
  sim.placeAgent("ilsa", NEXT_TO_SQUARE);
  return sim;
}

/** Mara offers Ilsa 1 bread for `price` coins first thing; Ilsa accepts. */
function createTradeSim(price: number): TestSim {
  const offer = { action: "give", target: "Ilsa", item: "bread", amount: 1 };
  const sim = createTestSim({
    agentIds: ["mara", "ilsa"],
    responder: scriptByAgent({
      Mara: (_request, callIndex) =>
        callIndex === 0
          ? decisionReply({ ...offer, inReturn: "coins", inReturnAmount: price })
          : undefined,
      Ilsa: (request: LlmRequest) =>
        promptOf(request).includes(`Mara is offering you 1 bread for ${price} coins`)
          ? decisionReply({ action: "continue", offer: "accept" })
          : undefined,
    }),
  });
  sim.placeAgent("mara", SQUARE);
  sim.placeAgent("ilsa", NEXT_TO_SQUARE);
  return sim;
}

function decisionPromptsOf(sim: TestSim, agentName: string): string[] {
  return sim.client.requests
    .filter((request) => request.schemaName === "decision_reply")
    .filter((request) => findPromptAgentName(request) === agentName)
    .map(promptOf);
}

describe("offers", () => {
  it("moves nothing until the recipient answers, and shows them the offer", async () => {
    const sim = createOfferSim({ offer: "accept" });
    await sim.advance();
    expect(countHeld(sim.state, "mara", "coin")).toBe(30);
    expect(sim.streamTexts("mara")).toContain("I offered Ilsa 3 coins");
    expect(sim.streamTexts("ilsa")).toContain("Mara offered me 3 coins");
    expect(getAgentRuntime(sim.state, "ilsa").pendingOffer).toMatchObject({ amount: 3 });
    await sim.advance();
    expect(decisionPromptsOf(sim, "Ilsa").at(-1)).toContain(
      "Just now: Mara is offering me 3 coins.",
    );
  });

  it("hands the things over when the recipient accepts", async () => {
    const sim = createOfferSim({ offer: "accept" });
    await sim.advance(2);
    expect(countHeld(sim.state, "mara", "coin")).toBe(27);
    expect(countHeld(sim.state, "ilsa", "coin")).toBe(13);
    expect(sim.streamTexts("mara")).toContain("I gave Ilsa 3 coins");
    expect(sim.streamTexts("ilsa")).toContain("Mara gave me 3 coins");
    expect(getAgentRuntime(sim.state, "ilsa").pendingOffer).toBeNull();
  });

  it("lets everyone around see a refusal and gives the giver a decision", async () => {
    const sim = createOfferSim({ offer: "decline" }, ["mara", "ilsa", "tobias"]);
    sim.placeAgent("tobias", { x: SQUARE.x, y: SQUARE.y + 1 });
    await sim.advance(3);
    expect(countHeld(sim.state, "mara", "coin")).toBe(30);
    expect(sim.streamTexts("ilsa")).toContain("I turned down the 3 coins Mara offered");
    expect(sim.streamTexts("mara")).toContain("Ilsa turned down the 3 coins I offered");
    expect(sim.streamTexts("tobias")).toContain(
      "I saw that Ilsa turned down the 3 coins Mara offered",
    );
    expect(decisionPromptsOf(sim, "Mara").at(-1)).toContain(
      "Just now: Ilsa turned down the 3 coins I offered.",
    );
  });

  it("turns an offer down quietly when the recipient's decision doesn't answer it", async () => {
    const sim = createOfferSim({}, ["mara", "ilsa", "tobias"]);
    sim.placeAgent("tobias", { x: SQUARE.x, y: SQUARE.y + 1 });
    await sim.advance(2);
    expect(countHeld(sim.state, "mara", "coin")).toBe(30);
    expect(sim.streamTexts("ilsa")).toContain("I didn't take the 3 coins Mara offered me");
    expect(sim.streamTexts("mara")).toContain("Ilsa didn't take the 3 coins I offered");
    expect(sim.streamTexts("tobias").join("\n")).not.toContain("didn't take");
  });

  it("withdraws the offer when the giver moves out of reach", async () => {
    const sim = createOfferSim({ offer: "accept" });
    await sim.advance();
    sim.placeAgent("mara", { x: SQUARE.x + 5, y: SQUARE.y });
    await sim.advance();
    expect(countHeld(sim.state, "ilsa", "coin")).toBe(10);
    expect(sim.streamTexts("ilsa")).toContain(
      "Mara was gone before I took the 3 coins they offered me",
    );
    expect(sim.streamTexts("mara")).toContain("I left before Ilsa took the 3 coins I offered");
  });

  it("lets an offer nobody answers lapse after its time", async () => {
    const sim = createOfferSim({});
    await sim.advance();
    const runtime = getAgentRuntime(sim.state, "ilsa");
    const offer = runtime.pendingOffer;
    if (offer === null) throw new Error("Mara's offer was not made");
    const lapseTicks = config.economy.offerLapseMinutes / config.clock.minutesPerTick;
    runtime.pendingOffer = { ...offer, offeredAtTick: sim.state.tick - lapseTicks };
    runtime.pendingDecision = null;
    await sim.advance();
    expect(runtime.pendingOffer).toBeNull();
    expect(sim.streamTexts("mara")).toContain("Ilsa didn't take the 3 coins I offered");
  });

  it("fails an accepted offer quietly when the giver no longer has the things", async () => {
    const sim = createOfferSim({ offer: "accept" });
    await sim.advance();
    const runtime = getAgentRuntime(sim.state, "ilsa");
    const offer = runtime.pendingOffer;
    if (offer === null) throw new Error("Mara's offer was not made");
    runtime.pendingOffer = { ...offer, amount: 500 };
    await sim.advance();
    expect(countHeld(sim.state, "ilsa", "coin")).toBe(10);
    expect(sim.streamTexts("ilsa")).toContain(
      "I went to take the 3 coins Mara offered me, but they no longer had them",
    );
    expect(sim.streamTexts("mara")).toContain(
      "Ilsa went to take the 3 coins I offered, but I no longer had them",
    );
  });

  it("can't offer anything to someone already weighing another offer", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "give", target: "Ilsa", item: "coins", amount: 3 })
            : undefined,
        Tobias: () => decisionReply({ action: "give", target: "Ilsa", item: "coins", amount: 1 }),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    sim.placeAgent("tobias", { x: SQUARE.x + 2, y: SQUARE.y });
    await sim.advance();
    expect(sim.streamTexts("tobias")).toContain(
      "I tried to hand Ilsa a coin but Ilsa hasn't answered another offer yet",
    );
    expect(getAgentRuntime(sim.state, "ilsa").pendingOffer).toMatchObject({ giverId: "mara" });
  });

  it("can't offer anything to someone asleep", async () => {
    const sim = createOfferSim({});
    const ilsaIndex = sim.state.agents.findIndex((agent) => agent.id === "ilsa");
    const ilsa = sim.agent("ilsa");
    sim.state.agents[ilsaIndex] = { ...ilsa, currentAction: { kind: "sleep", endsAtTick: null } };
    await sim.advance();
    expect(sim.streamTexts("mara")).toContain("I tried to hand Ilsa 3 coins but Ilsa is asleep");
    expect(getAgentRuntime(sim.state, "ilsa").pendingOffer).toBeNull();
  });

  it("shows the giver its own offer while the answer is awaited", async () => {
    const sim = createOfferSim({});
    await sim.advance(2);
    expect(decisionPromptsOf(sim, "Mara").at(-1)).toContain(
      "You are offering Ilsa 3 coins; no answer yet.",
    );
  });

  it("refuses a second offer to someone who hasn't answered the giver's first", async () => {
    let maraCalls = 0;
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: () => {
          maraCalls += 1;
          return maraCalls <= 2
            ? decisionReply({ action: "give", target: "Ilsa", item: "coins", amount: 3 })
            : undefined;
        },
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance(2);
    expect(sim.streamTexts("mara")).toContain(
      "I tried to hand Ilsa 3 coins but I was already offering Ilsa 3 coins",
    );
  });

  it("can't hand anything to someone beside the giver across a wall", () => {
    const sim = createOfferSim({}, ["mara", "ilsa"]);
    for (const pos of [NEXT_TO_SQUARE, { x: SQUARE.x, y: SQUARE.y + 1 }]) {
      const wall = createEntity(sim.state, "door", { kind: "tile", place: "town square", pos });
      addComponent(contextOf(sim), entityThing(wall), "closed", { minutes: null });
    }
    sim.placeAgent("ilsa", { x: SQUARE.x + 1, y: SQUARE.y + 1 });
    makeOffer(contextOf(sim), "mara", { kind: "give", target: "Ilsa", item: "coins", amount: 3 });
    expect(sim.streamTexts("mara")).toContain(
      "I tried to hand Ilsa 3 coins but I couldn't reach Ilsa from where I stood",
    );
  });

  it("trades both ways at once when a recipient accepts an offer with something asked back", async () => {
    const sim = createTradeSim(4);
    await sim.advance(2);
    expect(countHeld(sim.state, "ilsa", "bread")).toBe(3);
    expect(countHeld(sim.state, "ilsa", "coin")).toBe(6);
    expect(countHeld(sim.state, "mara", "coin")).toBe(34);
    expect(sim.streamTexts("ilsa")).toContain("Mara gave me 1 bread");
  });

  it("moves nothing when the recipient of a trade doesn't have what was asked back", async () => {
    const sim = createTradeSim(40);
    await sim.advance(2);
    expect(countHeld(sim.state, "ilsa", "bread")).toBe(2);
    expect(countHeld(sim.state, "mara", "coin")).toBe(30);
    expect(sim.streamTexts("mara")).toContain(
      "Ilsa went to take the 1 bread for 40 coins I offered, but didn't have 40 coins to give me",
    );
  });

  it("refuses to ask back something that doesn't exist", () => {
    const sim = createOfferSim({}, ["mara", "ilsa"]);
    const inReturn = { item: "moonbeams", amount: 2 };
    makeOffer(contextOf(sim), "mara", {
      kind: "give",
      target: "Ilsa",
      item: "bread",
      amount: 1,
      inReturn,
    });
    expect(getAgentRuntime(sim.state, "ilsa").pendingOffer).toBeNull();
  });

  it("walks up to someone in sight but out of reach before offering", async () => {
    const sim = createOfferSim({ offer: "accept" });
    sim.placeAgent("ilsa", { x: SQUARE.x + 4, y: SQUARE.y });
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).toBe("walk_to");
    expect(getAgentRuntime(sim.state, "mara").queuedActs[0]?.act.kind).toBe("give");
    await sim.advance(8);
    expect(sim.streamTexts("mara")).toContain("I offered Ilsa 3 coins");
  });
});
