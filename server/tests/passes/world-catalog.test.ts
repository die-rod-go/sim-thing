import { describe, expect, it } from "vitest";
import { describeWorldCatalog } from "../../src/passes/world-catalog";
import { loadTestItems } from "../../src/sim/test-sim";

const catalogLines = describeWorldCatalog(loadTestItems()).split("\n");

function findLine(thingName: string): string | undefined {
  return catalogLines.find((line) => line.startsWith(`- ${thingName}:`));
}

describe("describeWorldCatalog", () => {
  it("says what a recipe uses up and what it makes", () => {
    expect(findLine("chopping block")).toContain("cut planks (uses 1 wood; makes 2 planks)");
  });

  it("names the tool a verb needs and everything it makes", () => {
    expect(findLine("tree")).toContain("chop down (needs an axe; makes 6 wood, a sapling)");
  });

  it("joins the things a step accepts with or", () => {
    expect(findLine("fireplace")).toContain("uses 2 firewood or 2 sticks");
  });

  it("says the verbs every carried thing offers once, not on each carried thing", () => {
    const carriedLine = catalogLines.find((line) =>
      line.startsWith("Anything that can be carried"),
    );
    expect(carriedLine).toContain("drop");
    expect(findLine("bread")).toBe("- bread: eat");
  });

  it("lists the verbs done bare-handed on a line of their own", () => {
    expect(catalogLines.at(-1)).toBe("Done bare-handed, at someone or something: bury; punch");
  });

  it("offers verbs a thing gains once changed, like opening a door that is closed but not locked", () => {
    expect(findLine("door")).toBe("- door: open; close; lock (needs a key); unlock (needs a key)");
  });

  it("leaves out verbs nothing could ever be used with", () => {
    expect(findLine("bread")).not.toContain("unlock");
  });

  it("leaves out the agent body", () => {
    expect(catalogLines.some((line) => line.startsWith("- person"))).toBe(false);
  });
});
