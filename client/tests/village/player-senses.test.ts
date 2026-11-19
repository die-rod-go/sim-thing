import { describe, expect, it } from "vitest";
import type { Entity, PlayerView } from "@village/shared";
import { clientConfig } from "../../src/client-config";
import { makeSampleAgent } from "../../src/fixtures/sample-data";
import type { SpeechBubble } from "../../src/state/client-state";
import {
  buildSensedTiles,
  describeBubbleText,
  selectSensedAgents,
  selectSensedBubbles,
  selectSensedEntities,
} from "../../src/village/player-senses";

const MAP_WIDTH = 10;

/** A view that sees only the given tiles; the rest of its fields don't matter here. */
function viewSeeing(tiles: { x: number; y: number }[], creatureIds: string[] = []): PlayerView {
  return {
    visibleTiles: tiles.map((tile) => tile.y * MAP_WIDTH + tile.x),
    creatureIds,
  } as PlayerView;
}

function entityAt(id: string, x: number, y: number): Entity {
  return {
    id,
    definitionId: "pig",
    label: null,
    location: { kind: "tile", place: "square", pos: { x, y } },
    changes: {},
  };
}

function bubble(text: string, playerHearing: SpeechBubble["playerHearing"]): SpeechBubble {
  return { agentId: "ada", text, volume: "normal", tick: 1, playerHearing };
}

describe("seeing the village as the played agent", () => {
  it("draws the played agent and whoever stands in its sight", () => {
    const tiles = buildSensedTiles(viewSeeing([{ x: 2, y: 2 }]), MAP_WIDTH);
    const agents = [
      makeSampleAgent("ada", "Ada", 1, 1),
      makeSampleAgent("bob", "Bob", 2, 2),
      makeSampleAgent("cleo", "Cleo", 8, 8),
    ];
    const shown = selectSensedAgents(agents, "ada", tiles);
    expect(shown.map((agent) => agent.id)).toEqual(["ada", "bob"]);
  });

  it("hides creatures out of sight but keeps every other thing where it was last seen", () => {
    const tiles = buildSensedTiles(viewSeeing([{ x: 2, y: 2 }], ["pig-1", "pig-2"]), MAP_WIDTH);
    const entities = [entityAt("pig-1", 2, 2), entityAt("pig-2", 7, 7), entityAt("oven", 7, 7)];
    const shown = selectSensedEntities(entities, ["pig-1", "pig-2"], tiles);
    expect(shown.map((entity) => entity.id)).toEqual(["pig-1", "oven"]);
  });

  it("keeps the lines the agent heard, clearly or muffled, and reads muffled ones as a murmur", () => {
    const clear = bubble("Morning", "clear");
    const muffled = bubble("A secret", "muffled");
    const shown = selectSensedBubbles([
      clear,
      muffled,
      bubble("Far off", "none"),
      bubble("Old", null),
    ]);
    expect(shown).toEqual([clear, muffled]);
    expect(describeBubbleText(muffled, true)).toBe(clientConfig.player.muffledSpeechText);
    expect(describeBubbleText(muffled, false)).toBe("A secret");
  });
});
