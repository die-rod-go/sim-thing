import { describe, expect, it } from "vitest";
import { findEntity } from "../../src/items/entity-store";
import {
  aimWith,
  buildCombatSim,
  finish,
  fixRolls,
  handOver,
  place,
  readHealth,
  SQUARE,
} from "./combat-test-kit";

const TARGET = { x: 22, y: 15 };

describe("where a thrown item lands", () => {
  it("breaks a thrown jar into shards where it lands after a miss", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: TARGET });
    const jar = handOver(sim, "mara", "jar");
    fixRolls(sim, 0.99);
    aimWith(sim, "mara", jar, "throw", "Tobias");
    finish(sim, "mara");
    const landed = findEntity(sim.state, jar.id);
    expect(landed.definitionId).toBe("shards");
    expect(landed.location).toMatchObject({ kind: "tile" });
    expect(landed.location).not.toMatchObject({ pos: TARGET });
  });

  it("breaks a jar that hits someone on their tile", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: TARGET });
    const jar = handOver(sim, "mara", "jar");
    fixRolls(sim, 0);
    aimWith(sim, "mara", jar, "throw", "Tobias");
    finish(sim, "mara");
    const landed = findEntity(sim.state, jar.id);
    expect(landed.definitionId).toBe("shards");
    expect(landed.location).toMatchObject({ kind: "tile", pos: TARGET });
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
  });
});
