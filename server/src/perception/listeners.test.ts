import { describe, expect, it } from "vitest";
import { config } from "../config";
import { describeDirection } from "./direction";
import { canInterrupt, detectNewPerceptions, isOwnNameMentioned } from "./interrupts";
import { findObviousListeners } from "./listeners";
import { buildAsciiWorld, requireMarker } from "./test-grid";

describe("obvious listeners", () => {
  it("lists agents in sight within speech reach, marking who would hear a whisper", () => {
    const asciiWorld = buildAsciiWorld(`
      ###############
      #sw...n....f..#
      #####z#########
      #####h#########`);
    const at = (marker: string) => requireMarker(asciiWorld, marker);
    const speaker = { agentId: "speaker", name: "Speaker", pos: at("s"), isAsleep: false };
    const others = [
      speaker,
      { agentId: "whisperer", name: "Whisperer", pos: at("w"), isAsleep: false },
      { agentId: "near", name: "Near", pos: at("n"), isAsleep: false },
      { agentId: "far", name: "Far", pos: at("f"), isAsleep: false },
      { agentId: "dozing", name: "Dozing", pos: at("z"), isAsleep: true },
      { agentId: "hidden", name: "Hidden", pos: at("h"), isAsleep: false },
    ];
    expect(findObviousListeners(asciiWorld.world, speaker, others)).toEqual({
      wouldHearNormal: ["whisperer", "near"],
      wouldHearWhisper: ["whisperer"],
    });
  });
});

describe("direction words", () => {
  it("describes compass directions with north up", () => {
    expect(describeDirection({ x: 5, y: 5 }, { x: 5, y: 1 })).toBe("north");
    expect(describeDirection({ x: 5, y: 5 }, { x: 8, y: 8 })).toBe("south-east");
    expect(describeDirection({ x: 5, y: 5 }, { x: 10, y: 6 })).toBe("east");
    expect(describeDirection({ x: 5, y: 5 }, { x: 1, y: 2 })).toBe("north-west");
    expect(describeDirection({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe("right here");
  });
});

describe("perception interrupts", () => {
  it("detects agents that newly came into sight", () => {
    expect(detectNewPerceptions(["bob"], ["bob", "clara", "clara"])).toEqual(["clara"]);
    expect(detectNewPerceptions(["bob", "clara"], ["bob"])).toEqual([]);
  });

  it("allows an interrupt only after the cooldown", () => {
    const cooldown = config.perception.interruptCooldownTicks;
    expect(canInterrupt(null, 0)).toBe(true);
    expect(canInterrupt(100, 100 + cooldown - 1)).toBe(false);
    expect(canInterrupt(100, 100 + cooldown)).toBe(true);
  });

  it("matches its own name as a whole word regardless of case", () => {
    expect(isOwnNameMentioned("Morning, bob.", "Bob")).toBe(true);
    expect(isOwnNameMentioned("Bobby is here", "Bob")).toBe(false);
    expect(isOwnNameMentioned("Ask Mary Ann.", "Mary Ann")).toBe(true);
    expect(isOwnNameMentioned("Anything", "")).toBe(false);
  });
});
