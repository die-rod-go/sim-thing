import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { countHeld } from "../../src/items/entity-store";
import type { LlmRequest } from "../../src/llm/types";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
} from "../../src/sim/test-sim";

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
});
