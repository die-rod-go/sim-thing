import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listTileTypes, parseMapDocument, serializeMapDocument } from "./map-document";

const projectMapJson: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../maps/village.json"), "utf8"),
);

function buildTinyMapJson() {
  return {
    width: 3,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    nextlayerid: 3,
    nextobjectid: 5,
    tilesets: [
      {
        firstgid: 1,
        tiles: [
          {
            id: 0,
            type: "stone_floor",
            properties: [
              { name: "glyph", type: "int", value: 249 },
              { name: "color", type: "string", value: "#8a8a94" },
            ],
          },
        ],
      },
    ],
    layers: [
      { id: 1, name: "ground", type: "tilelayer", width: 3, height: 2, data: [1, 1, 1, 1, 1, 1] },
      { id: 2, name: "walls", type: "tilelayer", width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] },
    ],
  };
}

describe("parseMapDocument and serializeMapDocument", () => {
  it("round-trips the project map without changing it", () => {
    const document = parseMapDocument(projectMapJson);
    expect(serializeMapDocument(document)).toEqual(projectMapJson);
  });

  it("reads start tiles by character and item placements in tiles", () => {
    const document = parseMapDocument(projectMapJson);
    expect(document.starts.length).toBeGreaterThan(0);
    const bed = document.items.find((item) => item.label === "rose cottage bed");
    expect(bed).toMatchObject({ definitionId: "bed", x: 3, y: 3 });
  });

  it("adds the layers a map lacks, with fresh layer ids", () => {
    const document = parseMapDocument(buildTinyMapJson());
    expect(document.tileLayers.decor).toEqual([0, 0, 0, 0, 0, 0]);
    const saved = serializeMapDocument({
      ...document,
      starts: [{ id: 5, agentId: "mara", x: 2, y: 1 }],
      nextObjectId: 6,
    });
    const layers = saved.layers as { id: number; name: string; objects?: unknown[] }[];
    expect(layers.map((layer) => layer.name)).toEqual([
      "ground",
      "walls",
      "decor",
      "places",
      "objects",
      "starts",
    ]);
    expect(layers.map((layer) => layer.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(layers[5]?.objects).toEqual([
      expect.objectContaining({ name: "mara", x: 40, y: 24, point: true }),
    ]);
    expect(saved.nextlayerid).toBe(7);
  });

  it("refuses a tile layer with the wrong number of tiles", () => {
    const json = buildTinyMapJson();
    json.layers[0]!.data = [1, 1];
    expect(() => parseMapDocument(json)).toThrow(/one number per tile/);
  });
});

describe("listTileTypes", () => {
  it("names each tile from its Tiled type, with its glyph", () => {
    expect(listTileTypes(buildTinyMapJson())).toEqual([
      { gid: 1, name: "stone floor", glyph: { index: 249, color: "#8a8a94" } },
    ]);
  });
});
