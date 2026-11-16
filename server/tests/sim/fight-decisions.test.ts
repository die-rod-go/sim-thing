import { describe, expect, it } from "vitest";
import type { FakeReply } from "../../src/llm/fake-llm-client";
import { createTestSim, decisionReply, type TestSim } from "../../src/sim/test-sim";
import { NEXT_TO_SQUARE, SQUARE, aimWith, fixRolls, handOver, place } from "./combat-test-kit";

const ALWAYS_MISS = 0.99;
const IDLE_WAIT_MS = 5;
const LONGER_THAN_IDLE_WAIT_MS = 50;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

function waitReply(): FakeReply {
  return decisionReply({ action: "wait", minutes: 30 });
}

/** Mara swings at Tobias; replies come at once until `holdReplies`, then wait for `releaseAll`. */
async function setUpFight(shouldCallLlmInBackgroundDuringFight?: boolean) {
  const releases: ((reply: FakeReply) => void)[] = [];
  let isHolding = false;
  const sim = createTestSim({
    agentIds: ["mara", "tobias"],
    responder: () =>
      isHolding
        ? new Promise<FakeReply>((resolveReply) => releases.push(resolveReply))
        : waitReply(),
    shouldCallLlmInBackground: true,
    idleDecisionWaitMs: IDLE_WAIT_MS,
    ...(shouldCallLlmInBackgroundDuringFight === undefined
      ? {}
      : { shouldCallLlmInBackgroundDuringFight }),
  });
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  await sim.advance();
  fixRolls(sim, ALWAYS_MISS);
  aimWith(sim, "mara", handOver(sim, "mara", "knife"), "attack", "Tobias");
  isHolding = true;
  await sim.advance();
  const releaseAll = () => {
    for (const release of releases.splice(0)) release(waitReply());
  };
  return { sim, releaseAll };
}

/** Starts the tick in which the attack lands and gives it longer than the idle wait cap. */
async function startAttackTick(sim: TestSim) {
  let isTickDone = false;
  const ticking = sim.advance().then((results) => {
    isTickDone = true;
    return results;
  });
  await pause(LONGER_THAN_IDLE_WAIT_MS);
  return { ticking, isTickDone: () => isTickDone };
}

describe("decisions during a fight", () => {
  it("holds the clock for every decision in flight once an attack lands", async () => {
    const { sim, releaseAll } = await setUpFight(false);
    const tick = await startAttackTick(sim);
    expect(tick.isTickDone()).toBe(false);
    releaseAll();
    const [result] = await tick.ticking;
    expect(result?.events.map((event) => event.kind)).toContain("missed");
    expect(result?.decidedAgentIds).toEqual(["mara", "tobias"]);
  });

  it("keeps decisions in the background during a fight when the setting allows it", async () => {
    const { sim, releaseAll } = await setUpFight();
    const tick = await startAttackTick(sim);
    expect(tick.isTickDone()).toBe(true);
    const [result] = await tick.ticking;
    expect(result?.events.map((event) => event.kind)).toContain("missed");
    expect(result?.decidedAgentIds).toEqual([]);
    releaseAll();
  });
});
