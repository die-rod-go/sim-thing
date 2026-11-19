import { describe, expect, it } from "vitest";
import { readInteractAsIntendedAct } from "../../src/sim/act-repair";
import { addVerbs, buildCombatSim } from "./combat-test-kit";

describe("readInteractAsIntendedAct", () => {
  it("reads an interact with 'say' as a say act", () => {
    const sim = buildCombatSim();
    const act = readInteractAsIntendedAct(sim.state, {
      action: "interact",
      verb: "Say",
      say: "Good morning",
      volume: "shout",
    });
    expect(act).toEqual({ action: "say", say: "Good morning", volume: "shout" });
  });

  it("takes the words of a 'speak' from its text when it has no say", () => {
    const sim = buildCombatSim();
    const act = readInteractAsIntendedAct(sim.state, {
      action: "interact",
      verb: "speak",
      text: "Who left the sword here?",
    });
    expect(act).toEqual({ action: "say", say: "Who left the sword here?" });
  });

  it("says a 'whisper' at a whisper unless the reply chose a volume", () => {
    const sim = buildCombatSim();
    const whispered = readInteractAsIntendedAct(sim.state, {
      action: "interact",
      verb: "whisper",
      say: "Over here",
    });
    expect(whispered).toEqual({ action: "say", say: "Over here", volume: "whisper" });
    const chosen = readInteractAsIntendedAct(sim.state, {
      action: "interact",
      verb: "whisper",
      say: "Over here",
      volume: "normal",
    });
    expect(chosen.volume).toBe("normal");
  });

  it("reads an interact with no verb and no item, aimed at someone with words, as a say", () => {
    const sim = buildCombatSim();
    const act = readInteractAsIntendedAct(sim.state, {
      action: "interact",
      target: "Nell",
      say: "Nell, how are you really?",
      volume: "normal",
    });
    expect(act).toEqual({ action: "say", say: "Nell, how are you really?", volume: "normal" });
  });

  it("leaves an interact with no verb and no words to fail", () => {
    const sim = buildCombatSim();
    const act = { action: "interact" as const, target: "Nell" };
    expect(readInteractAsIntendedAct(sim.state, act)).toBe(act);
  });

  it("reads another act's name as a verb as that act, with its fields", () => {
    const sim = buildCombatSim();
    expect(
      readInteractAsIntendedAct(sim.state, {
        action: "interact",
        verb: "wait",
        minutes: 2,
        say: "I'm listening.",
      }),
    ).toEqual({ action: "wait", minutes: 2, say: "I'm listening." });
    expect(readInteractAsIntendedAct(sim.state, { action: "interact", verb: "Continue" })).toEqual({
      action: "continue",
    });
  });

  it("aims a walk or follow named as a verb at its item when it has no target", () => {
    const sim = buildCombatSim();
    expect(
      readInteractAsIntendedAct(sim.state, { action: "interact", verb: "walk_to", item: "well" }),
    ).toEqual({ action: "walk_to", item: "well", target: "well" });
    expect(
      readInteractAsIntendedAct(sim.state, { action: "interact", verb: "Follow", target: "Nell" }),
    ).toEqual({ action: "follow", target: "Nell" });
  });

  it("leaves a name alone when items.json has a verb of that name", () => {
    const sim = buildCombatSim();
    addVerbs(sim, [
      { name: "say", appliesTo: { has: "holdable" }, steps: [] },
      { name: "wait", appliesTo: { has: "holdable" }, steps: [] },
    ]);
    const say = { action: "interact" as const, verb: "say", item: "note" };
    expect(readInteractAsIntendedAct(sim.state, say)).toBe(say);
    const wait = { action: "interact" as const, verb: "wait", item: "note" };
    expect(readInteractAsIntendedAct(sim.state, wait)).toBe(wait);
  });

  it("leaves other interacts and other acts alone", () => {
    const sim = buildCombatSim();
    const dance = { action: "interact" as const, verb: "dance" };
    expect(readInteractAsIntendedAct(sim.state, dance)).toBe(dance);
    const say = { action: "say" as const, say: "Hello" };
    expect(readInteractAsIntendedAct(sim.state, say)).toBe(say);
  });
});
