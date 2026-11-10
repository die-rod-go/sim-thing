import { describe, expect, it } from "vitest";
import { config } from "../config";
import { tileIndex } from "../world/types";
import {
  classifyHearing,
  clearSoundCostCache,
  computeSoundCosts,
  computeSpeechReachTiles,
} from "./sound";
import { buildAsciiWorld, requireMarker } from "./test-grid";

const normalLoudness = config.perception.speechLoudness.normal;

const cornerArt = `
  #######
  #a....#
  #####.#
  #b#c..#
  #######`;

describe("sound", () => {
  it("speech travels around a corner but not through walls", () => {
    const asciiWorld = buildAsciiWorld(cornerArt);
    const { grid } = asciiWorld.world;
    const costs = computeSoundCosts(
      asciiWorld.world,
      requireMarker(asciiWorld, "a"),
      normalLoudness,
    );
    expect(costs[tileIndex(grid, requireMarker(asciiWorld, "c"))]).toBe(8);
    expect(costs[tileIndex(grid, requireMarker(asciiWorld, "b"))]).toBe(Infinity);
  });

  it("a closed door costs more to pass than an open tile", () => {
    const closed = buildAsciiWorld("#a..D..b#");
    const open = buildAsciiWorld("#a..O..b#");
    const listenerIndex = tileIndex(closed.world.grid, requireMarker(closed, "b"));
    const maxCost = normalLoudness * config.perception.muffledReachMultiplier;
    expect(
      computeSoundCosts(closed.world, requireMarker(closed, "a"), maxCost)[listenerIndex],
    ).toBe(9);
    expect(computeSoundCosts(open.world, requireMarker(open, "a"), maxCost)[listenerIndex]).toBe(6);
  });

  it("stops spreading beyond the maximum cost", () => {
    const asciiWorld = buildAsciiWorld("#a.....b#");
    const costs = computeSoundCosts(asciiWorld.world, requireMarker(asciiWorld, "a"), 3);
    expect(costs[tileIndex(asciiWorld.world.grid, requireMarker(asciiWorld, "b"))]).toBe(Infinity);
  });

  it("hears clearly within loudness and muffled within 1.5x", () => {
    expect(classifyHearing(8, 8)).toBe("clear");
    expect(classifyHearing(9, 8)).toBe("muffled");
    expect(classifyHearing(12, 8)).toBe("muffled");
    expect(classifyHearing(13, 8)).toBe("none");
    expect(classifyHearing(Infinity, 8)).toBe("none");
  });

  it("reuses a cached fill until the doors change or the cache is cleared", () => {
    const asciiWorld = buildAsciiWorld("#a..D..b#");
    const source = requireMarker(asciiWorld, "a");
    const first = computeSoundCosts(asciiWorld.world, source, normalLoudness);
    expect(computeSoundCosts(asciiWorld.world, source, normalLoudness)).toBe(first);

    const openedWorld = { ...asciiWorld.world, closedDoorTiles: new Set<number>() };
    expect(computeSoundCosts(openedWorld, source, normalLoudness)).not.toBe(first);

    clearSoundCostCache(asciiWorld.world.grid);
    const refilled = computeSoundCosts(asciiWorld.world, source, normalLoudness);
    expect(refilled).not.toBe(first);
    expect(refilled).toEqual(first);
  });

  it("lists tiles within clear speech reach for the overlay", () => {
    const asciiWorld = buildAsciiWorld("#a.........#");
    const reachTiles = computeSpeechReachTiles(
      asciiWorld.world,
      requireMarker(asciiWorld, "a"),
      "whisper",
    );
    const whisperLoudness = config.perception.speechLoudness.whisper;
    expect(reachTiles).toHaveLength(whisperLoudness + 1);
    expect(reachTiles).toContain(
      tileIndex(asciiWorld.world.grid, { x: 1 + whisperLoudness, y: 0 }),
    );
  });
});
