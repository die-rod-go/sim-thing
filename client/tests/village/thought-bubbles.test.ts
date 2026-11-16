import { describe, expect, it } from "vitest";
import { makeSampleAgent } from "../../src/fixtures/sample-data";
import {
  nextThoughtMode,
  parseThoughtMode,
  selectVisibleThoughts,
  truncateThought,
  type ThoughtVisibility,
} from "../../src/village/thought-bubbles";

const ada = { ...makeSampleAgent("ada", "Ada", 0, 0), lastThought: { text: "Bread?", tick: 10 } };
const bob = { ...makeSampleAgent("bob", "Bob", 1, 0), lastThought: { text: "Ale.", tick: 12 } };
const cleo = { ...makeSampleAgent("cleo", "Cleo", 2, 0), lastThought: null };

const visibility: ThoughtVisibility = {
  mode: "selected",
  inspectedAgentId: "ada",
  currentTick: 15,
  maxAgeTicks: 10,
  maxLength: 40,
};

describe("selectVisibleThoughts", () => {
  it("shows only the inspected agent's thought in selected mode", () => {
    const thoughts = selectVisibleThoughts([ada, bob, cleo], visibility);
    expect([...thoughts.keys()]).toEqual(["ada"]);
  });

  it("shows every agent that has a thought in everyone mode", () => {
    const thoughts = selectVisibleThoughts([ada, bob, cleo], { ...visibility, mode: "everyone" });
    expect([...thoughts.keys()]).toEqual(["ada", "bob"]);
  });

  it("shows nothing when off", () => {
    expect(selectVisibleThoughts([ada, bob], { ...visibility, mode: "off" }).size).toBe(0);
  });

  it("hides a thought older than the age limit", () => {
    const thoughts = selectVisibleThoughts([ada, bob], {
      ...visibility,
      mode: "everyone",
      currentTick: 21,
    });
    expect([...thoughts.keys()]).toEqual(["bob"]);
  });
});

describe("truncateThought", () => {
  it("leaves a short thought whole", () => {
    expect(truncateThought("  I need bread. ", 40)).toBe("I need bread.");
  });

  it("cuts a long thought at a word boundary with an ellipsis", () => {
    expect(truncateThought("I wonder whether Bob still owes me two coins", 20)).toBe(
      "I wonder whether…",
    );
  });
});

describe("thought modes", () => {
  it("cycles selected, everyone, off and back", () => {
    expect(nextThoughtMode("selected")).toBe("everyone");
    expect(nextThoughtMode("everyone")).toBe("off");
    expect(nextThoughtMode("off")).toBe("selected");
  });

  it("rejects an unknown stored mode", () => {
    expect(parseThoughtMode("loud")).toBeNull();
    expect(parseThoughtMode("off")).toBe("off");
  });
});
