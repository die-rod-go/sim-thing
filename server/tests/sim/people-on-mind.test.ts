import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { EMPTY_PERSON_ENTRY } from "../../src/passes/apply-pass";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { listPeopleOnMind } from "../../src/sim/people-on-mind";
import { createTestSim, scriptByAgent } from "../../src/sim/test-sim";
import { replaceAgent } from "../../src/sim/world-access";

const EVERYONE = ["mara", "edwin", "wren", "tobias", "bram", "ilsa"];

function buildSim() {
  const sim = createTestSim({ agentIds: EVERYONE, responder: scriptByAgent({}) });
  const people = Object.fromEntries(
    EVERYONE.filter((agentId) => agentId !== "mara").map((agentId) => [
      agentId,
      EMPTY_PERSON_ENTRY,
    ]),
  );
  replaceAgent(sim.state, { ...sim.agent("mara"), people });
  return sim;
}

function speak(sim: ReturnType<typeof buildSim>, speakerId: string, listenerIds: string[]) {
  sim.state.conversationLog.lines.push({
    speakerId,
    speakerName: sim.agent(speakerId).name,
    tick: sim.state.tick,
    words: "hello",
    volume: "normal",
    clearListenerIds: listenerIds,
    muffledListenerIds: [],
  });
}

describe("people on the agent's mind", () => {
  it("puts the conversation first, then those in sight, then those named", () => {
    const sim = buildSim();
    speak(sim, "bram", ["mara"]);
    getAgentRuntime(sim.state, "mara").visibleAgentIds = ["wren"];
    const names = listPeopleOnMind(sim.state, sim.agent("mara"), ["find Tobias at the tavern"]).map(
      (person) => person.name,
    );
    expect(names).toEqual(["Bram", "Wren", "Tobias"]);
  });

  it("shows no more than the configured number, and only people the agent knows", () => {
    const sim = buildSim();
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      people: { edwin: EMPTY_PERSON_ENTRY, wren: EMPTY_PERSON_ENTRY, tobias: EMPTY_PERSON_ENTRY },
    });
    getAgentRuntime(sim.state, "mara").visibleAgentIds = ["edwin", "wren", "tobias", "bram"];
    const onMind = listPeopleOnMind(sim.state, sim.agent("mara"), []);
    expect(onMind.length).toBeLessThanOrEqual(config.people.fullEntriesMax);
    expect(onMind.map((person) => person.name)).not.toContain("Bram");
  });
});
