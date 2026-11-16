import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseItemFile, type ItemFile } from "@village/shared";
import { config } from "../src/config";
import { createItemEditor, type ItemEditor } from "../src/item-editor";
import type { WorldMap } from "../src/world/types";

const repositoryRoot = resolve(import.meta.dirname, "../..");

const map: WorldMap = {
  grid: { width: 2, height: 1, isWall: [false, false] },
  places: [],
  placements: [
    { label: "bakery oven", definitionId: "oven", place: "bakery", pos: { x: 1, y: 0 } },
  ],
  startTiles: { mara: { x: 0, y: 0 } },
};

const seedAgent = {
  id: "mara",
  name: "Mara",
  profession: "baker",
  traits: { extraversion: 0, agreeableness: 0, conscientiousness: 0, neuroticism: 0, openness: 0 },
  core: "",
  selfImage: "",
  sleepRecoveryPerHour: 0.15,
  strength: 0.5,
  agility: 0.5,
  inventory: { coin: 30, bread: 2 },
  mood: "",
  goals: [],
  people: {},
  seenPlaces: [],
};

describe("item editor", () => {
  let directory: string;
  let itemFilePath: string;
  let editor: ItemEditor;

  const readSavedText = () => readFileSync(itemFilePath, "utf8");
  const loadFile = (): ItemFile => parseItemFile(JSON.parse(readSavedText()));
  const withoutDefinition = (file: ItemFile, definitionId: string): ItemFile => ({
    ...file,
    definitions: file.definitions.filter((definition) => definition.id !== definitionId),
  });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "village-items-"));
    itemFilePath = join(directory, "items.json");
    copyFileSync(resolve(repositoryRoot, config.server.itemsPath), itemFilePath);
    const seedFilePath = join(directory, "agents.json");
    writeFileSync(seedFilePath, JSON.stringify({ agents: [seedAgent] }));
    editor = createItemEditor({ itemFilePath, seedFilePath, getMap: () => map });
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("sends the item file with the definitions the map and seeds use", () => {
    const message = editor.describeItemFile();
    expect(message.loadError).toBeNull();
    expect(message.itemFile?.definitions.map((definition) => definition.id)).toContain("oven");
    expect(message.references.map((reference) => reference.definitionId)).toEqual([
      "oven",
      "coin",
      "bread",
    ]);
  });

  it("saves a valid item file", () => {
    const file = loadFile();
    const renamed = {
      ...file,
      definitions: file.definitions.map((definition) =>
        definition.id === "ale" ? { ...definition, name: "dark ale" } : definition,
      ),
    };
    expect(editor.saveItemFile(renamed).isSaved).toBe(true);
    expect(loadFile().definitions.find((definition) => definition.id === "ale")?.name).toBe(
      "dark ale",
    );
  });

  it("refuses a malformed item file and leaves the file alone", () => {
    const before = readSavedText();
    const result = editor.saveItemFile({ ...loadFile(), definitions: "none" });
    expect(result.isSaved).toBe(false);
    expect(result.problems[0]?.path).toBe("definitions");
    expect(readSavedText()).toBe(before);
  });

  it("refuses to delete a definition the map still places", () => {
    const before = readSavedText();
    const result = editor.saveItemFile(withoutDefinition(loadFile(), "oven"));
    expect(result.isSaved).toBe(false);
    expect(result.problems.map((problem) => problem.message).join("\n")).toContain("bakery oven");
    expect(readSavedText()).toBe(before);
  });

  it("refuses to delete a definition a seed inventory still holds", () => {
    const result = editor.saveItemFile(withoutDefinition(loadFile(), "bread"));
    expect(result.isSaved).toBe(false);
    expect(result.problems.map((problem) => problem.message).join("\n")).toContain("mara");
  });
});
