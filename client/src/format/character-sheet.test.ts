import { describe, expect, it } from "vitest";
import {
  describeActivity,
  describeNeed,
  describeTrait,
  formatCarrying,
  formatClockTime,
} from "./character-sheet";

const timeSettings = { minutesPerTick: 1, startHour: 6 };

describe("characterSheet", () => {
  it("words needs from worst to best and flags the urgent ones", () => {
    expect(describeNeed("hunger", 0.05)).toMatchObject({ word: "starving", isAlert: true });
    expect(describeNeed("hunger", 0.3)).toMatchObject({ word: "hungry", isAlert: true });
    expect(describeNeed("hunger", 0.6)).toMatchObject({ word: "fed", isAlert: false });
    expect(describeNeed("energy", 1)).toMatchObject({ word: "lively", levelIndex: 4 });
  });

  it("phrases traits by direction and distance from the middle", () => {
    expect(describeTrait("extraversion", 0.05).phrase).toBe("neither reserved nor outgoing");
    expect(describeTrait("extraversion", 0.2).phrase).toBe("a little outgoing");
    expect(describeTrait("extraversion", -0.5).phrase).toBe("quite reserved");
    expect(describeTrait("neuroticism", 0.9)).toEqual({
      phrase: "very anxious",
      intensity: "extreme",
    });
  });

  it("describes what an agent is doing in plain words", () => {
    expect(describeActivity(null, timeSettings)).toBe("idle");
    expect(
      describeActivity({ kind: "walk_to", target: "bakery", endsAtTick: null }, timeSettings),
    ).toBe("walking to bakery");
    expect(
      describeActivity(
        { kind: "interact", target: "oven", verb: "bake bread", endsAtTick: 30 },
        timeSettings,
      ),
    ).toBe("bake bread at oven until 6:30 am");
    expect(describeActivity({ kind: "sleep", target: "bed", endsAtTick: null }, timeSettings)).toBe(
      "asleep in bed",
    );
  });

  it("shows the clock time without the day", () => {
    expect(formatClockTime(65, timeSettings)).toBe("7:05 am");
  });

  it("counts what the agent carries by definition, coins included", () => {
    const glyph = { index: 0, color: "#ffffff" };
    const definitions = [
      { id: "coin", name: "coin", plural: "coins", glyph },
      { id: "bread", name: "bread", glyph },
    ].map((definition) => ({ ...definition, components: {} }));
    const carried = (id: string, definitionId: string, agentId: string) => ({
      id,
      definitionId,
      label: null,
      location: { kind: "inside" as const, holderId: agentId },
      changes: {},
    });
    const entities = [
      carried("entity-1", "coin", "ada"),
      carried("entity-2", "coin", "ada"),
      carried("entity-3", "bread", "ada"),
      carried("entity-4", "bread", "bob"),
    ];
    expect(formatCarrying("ada", entities, definitions)).toEqual(["2 coins", "1 bread"]);
  });
});
