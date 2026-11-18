import { describe, expect, it } from "vitest";
import { readSpeechVerbAsWords } from "../../src/sim/decision-runner";
import { addVerbs, buildCombatSim } from "./combat-test-kit";

describe("readSpeechVerbAsWords", () => {
  it("reads an interact with 'say' as words said while waiting", () => {
    const sim = buildCombatSim();
    const act = readSpeechVerbAsWords(sim.state, {
      action: "interact",
      verb: "Say",
      say: "Good morning",
      volume: "shout",
    });
    expect(act).toEqual({ action: "wait", say: "Good morning", volume: "shout" });
  });

  it("takes the words of a 'speak' from its text when it has no say", () => {
    const sim = buildCombatSim();
    const act = readSpeechVerbAsWords(sim.state, {
      action: "interact",
      verb: "speak",
      text: "Who left the sword here?",
    });
    expect(act).toEqual({ action: "wait", say: "Who left the sword here?" });
  });

  it("leaves a speech verb alone when items.json has a verb of that name", () => {
    const sim = buildCombatSim();
    addVerbs(sim, [{ name: "say", appliesTo: { has: "holdable" }, steps: [] }]);
    const act = { action: "interact" as const, verb: "say", item: "note" };
    expect(readSpeechVerbAsWords(sim.state, act)).toBe(act);
  });

  it("leaves other interacts alone", () => {
    const sim = buildCombatSim();
    const act = { action: "interact" as const, verb: "dance" };
    expect(readSpeechVerbAsWords(sim.state, act)).toBe(act);
  });
});
