import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { loadTestMap } from "../../src/sim/test-sim";
import { findPlaceAt } from "../../src/world/map-loader";
import {
  describeLocation,
  findNearestPlace,
  findOutdoorSpot,
  listOutdoorSpots,
} from "../../src/world/place-names";

const BETWEEN_BAKERY_AND_SQUARE = { x: 11, y: 14 };
const BAKERY_FLOOR = { x: 5, y: 14 };
const OUTDOORS = config.map.defaultOutdoorPlace;

describe("place names", () => {
  it("names a spot outside every place after the nearest place", () => {
    const map = loadTestMap();
    expect(findPlaceAt(map, BETWEEN_BAKERY_AND_SQUARE)).toBe(OUTDOORS);
    expect(findNearestPlace(map, BETWEEN_BAKERY_AND_SQUARE)?.name).toBe("bakery");
    expect(describeLocation(map, OUTDOORS, BETWEEN_BAKERY_AND_SQUARE)).toBe(
      "the road by the bakery",
    );
  });

  it("keeps the name of a place for a spot inside it", () => {
    expect(describeLocation(loadTestMap(), "bakery", BAKERY_FLOOR)).toBe("bakery");
  });

  it("leads the road by a place to an outdoor tile that goes by the same name", () => {
    const map = loadTestMap();
    const spot = findOutdoorSpot(map, "bakery");
    if (spot === null) throw new Error("the bakery should have a road by it");
    expect(findPlaceAt(map, spot)).toBe(OUTDOORS);
    expect(describeLocation(map, OUTDOORS, spot)).toBe("the road by the bakery");
    expect(listOutdoorSpots(map)).toContainEqual({ name: "the road by the bakery", pos: spot });
  });
});
