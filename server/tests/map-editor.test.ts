import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { createMapEditor, type MapEditor } from "../src/map-editor";
import { loadSeedFile } from "../src/seeds";
import { formatMapFileText } from "../src/world/map-file-text";
import { loadWorldMap } from "../src/world/map-loader";

const repositoryRoot = resolve(import.meta.dirname, "../..");

interface TiledObject {
  name: string;
}
interface TiledLayer {
  name: string;
  objects?: TiledObject[];
}

function readProjectMap(): { layers: TiledLayer[] } {
  return JSON.parse(readFileSync(resolve(repositoryRoot, config.server.mapPath), "utf8")) as {
    layers: TiledLayer[];
  };
}

describe("map editor", () => {
  let directory: string;
  let mapFilePath: string;
  let editor: MapEditor;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "village-map-"));
    mapFilePath = join(directory, "village.json");
    const itemFilePath = join(directory, "items.json");
    const seedFilePath = join(directory, "agents.json");
    copyFileSync(resolve(repositoryRoot, config.server.mapPath), mapFilePath);
    copyFileSync(resolve(repositoryRoot, config.server.itemsPath), itemFilePath);
    copyFileSync(resolve(repositoryRoot, config.server.seedsPath), seedFilePath);
    editor = createMapEditor({ mapFilePath, itemFilePath, seedFilePath });
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("sends the map with the items it may place and the characters it starts", () => {
    const message = editor.describeMapFile();
    expect(message.loadError).toBeNull();
    const seedIds = loadSeedFile(join(directory, "agents.json")).agents.map((agent) => agent.id);
    expect(message.references.characters.map((character) => character.id)).toEqual(seedIds);
    const placeableIds = message.references.placeableItems.map((item) => item.id);
    expect(placeableIds).toContain("bed");
    expect(placeableIds).not.toContain("person");
  });

  it("saves a valid map with one line per row of tiles", () => {
    const tiledMap = readProjectMap();
    const result = editor.saveMapFile(tiledMap);
    expect(result.isSaved).toBe(true);
    const text = readFileSync(mapFilePath, "utf8");
    expect(text).toBe(formatMapFileText(tiledMap));
    expect(loadWorldMap(mapFilePath).grid.width).toBeGreaterThan(0);
  });

  it("refuses a map missing a character's start tile and leaves the file alone", () => {
    const before = readFileSync(mapFilePath, "utf8");
    const tiledMap = readProjectMap();
    const startsLayer = tiledMap.layers.find((layer) => layer.name === "starts");
    if (startsLayer) startsLayer.objects = [];
    const result = editor.saveMapFile(tiledMap);
    expect(result.isSaved).toBe(false);
    expect(result.problems[0]?.message).toMatch(/has no start tile/);
    expect(readFileSync(mapFilePath, "utf8")).toBe(before);
  });

  it("reports a malformed map as a problem instead of throwing", () => {
    const result = editor.saveMapFile({ layers: "none" });
    expect(result.isSaved).toBe(false);
    expect(result.problems[0]?.message).toMatch(/malformed/);
  });

  it("still sends the map when the seed file can't be read", () => {
    writeFileSync(join(directory, "agents.json"), "not json");
    const message = editor.describeMapFile();
    expect(message.mapFile).not.toBeNull();
    expect(message.references.characters).toEqual([]);
  });
});
