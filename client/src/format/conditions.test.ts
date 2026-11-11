import type { ConditionDefinition, Entity } from "@village/shared";
import { describe, expect, it } from "vitest";
import { listTileConditionOverlays, listVisibleConditions } from "./conditions";

const DEFINITIONS: ConditionDefinition[] = [
  {
    name: "burning",
    words: "on fire",
    isVisible: true,
    defaultMinutes: 30,
    everyMinute: [],
    onEnd: [],
    phrases: {},
  },
  {
    name: "poisoned",
    words: "poisoned",
    isVisible: false,
    defaultMinutes: null,
    everyMinute: [],
    onEnd: [],
    phrases: {},
  },
];

function condition(name: string) {
  return { name, endsAtTick: null, sourceAgentId: null };
}

describe("visible conditions", () => {
  it("shows only the conditions others can see", () => {
    const shown = listVisibleConditions([condition("poisoned"), condition("burning")], DEFINITIONS);
    expect(shown).toEqual([{ name: "burning", words: "on fire" }]);
  });

  it("puts an overlay on the tile of a thing that is on fire, not on carried things", () => {
    const door: Entity = {
      id: "entity-1",
      definitionId: "door",
      label: null,
      location: { kind: "tile", place: "bakery", pos: { x: 3, y: 4 } },
      state: { conditions: [condition("burning")] },
    };
    const carried: Entity = {
      ...door,
      id: "entity-2",
      location: { kind: "inventory", agentId: "mara" },
    };
    expect(listTileConditionOverlays([door, carried], DEFINITIONS)).toEqual([
      { key: "entity-1:burning", conditionName: "burning", tileX: 3, tileY: 4 },
    ]);
  });
});
