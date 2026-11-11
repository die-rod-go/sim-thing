import { afterEach, describe, expect, it, vi } from "vitest";

// Test files share modules (`isolate: false`), so the stimulus hook is swapped in a fresh module
// graph rather than with a hoisted `vi.mock`.
async function loadWithStimulusSpy() {
  vi.resetModules();
  vi.doMock("./effects/stimulus", () => ({ sendStimulus: vi.fn() }));
  const kit = await import("./combat-test-kit");
  const { sendStimulus } = await import("./effects/stimulus");
  return { kit, sendStimulus: vi.mocked(sendStimulus) };
}

afterEach(() => {
  vi.doUnmock("./effects/stimulus");
  vi.resetModules();
});

describe("where a thrown item lands", () => {
  it("sends impact to the thrown item where it lands, even on a miss", async () => {
    const { kit, sendStimulus } = await loadWithStimulusSpy();
    const sim = kit.buildCombatSim();
    kit.place(sim, { mara: kit.SQUARE, tobias: { x: 22, y: 15 } });
    const knife = kit.handOver(sim, "mara", "knife");
    kit.fixRolls(sim, 0.99);
    kit.aimWith(sim, "mara", knife, "throw", "Tobias");
    kit.finish(sim, "mara");
    expect(sendStimulus).toHaveBeenCalledTimes(1);
    expect(sendStimulus).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "entity", entityId: knife.id },
      "impact",
    );
  });
});
