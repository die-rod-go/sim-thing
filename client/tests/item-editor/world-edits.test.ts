import { describe, expect, it } from "vitest";
import { buildTestItemFile } from "../../../shared/tests/items/test-item-file";
import { setWorldSetting } from "../../src/item-editor/world-edits";

describe("world settings edits", () => {
  it("sets a matcher setting and leaves the others alone", () => {
    const file = setWorldSetting(buildTestItemFile(), "sightBlockedBy", { has: "health" });
    expect(file.world.sightBlockedBy).toEqual({ has: "health" });
    expect(file.world.agentBody).toBe("person");
  });

  it("drops a matcher setting given undefined", () => {
    const file = setWorldSetting(buildTestItemFile(), "closedSupply", undefined);
    expect(Object.hasOwn(file.world, "closedSupply")).toBe(false);
  });

  it("does not change the file it was given", () => {
    const file = buildTestItemFile();
    setWorldSetting(file, "agentBody", "other");
    expect(file.world.agentBody).toBe("person");
  });
});
