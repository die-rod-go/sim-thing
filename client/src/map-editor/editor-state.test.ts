import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MapFileMessage } from "@village/shared";
import {
  hasUnsavedChanges,
  initialMapEditorState,
  reduceMapEditorState,
  type MapEditorState,
} from "./editor-state";
import { paintTiles, removeItem } from "./map-edits";

const loadedMessage: MapFileMessage = {
  type: "map_file",
  mapFile: JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../../maps/village.json"), "utf8"),
  ) as unknown,
  loadError: null,
  references: { placeableItems: [], characters: [] },
};

function loadMap(): MapEditorState {
  return reduceMapEditorState(initialMapEditorState, { kind: "loaded", message: loadedMessage });
}

function paintCorner(state: MapEditorState, gid: number, isContinuation = false) {
  const document = paintTiles(state.draft!, "ground", [{ x: 0, y: 0 }], gid);
  return reduceMapEditorState(state, { kind: "edited", document, isContinuation });
}

describe("map editor state", () => {
  it("loads the map and its tile palette", () => {
    const state = loadMap();
    expect(state.draft?.width).toBeGreaterThan(0);
    expect(state.tileTypes.length).toBeGreaterThan(0);
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("reports a map it can't read as a load error", () => {
    const state = reduceMapEditorState(initialMapEditorState, {
      kind: "loaded",
      message: { ...loadedMessage, mapFile: { width: 0 } },
    });
    expect(state.loadError).toMatch(/width/);
    expect(state.draft).toBeNull();
  });

  it("folds a whole drag into one undo step", () => {
    const loaded = loadMap();
    const dragged = paintCorner(paintCorner(paintCorner(loaded, 7), 8, true), 9, true);
    expect(dragged.undoStack).toHaveLength(1);
    const undone = reduceMapEditorState(dragged, { kind: "undone" });
    expect(undone.draft).toBe(loaded.draft);
    expect(hasUnsavedChanges(undone)).toBe(false);
    const redone = reduceMapEditorState(undone, { kind: "redone" });
    expect(redone.draft?.tileLayers.ground[0]).toBe(9);
  });

  it("drops the selection when undo or an edit removes what it pointed at", () => {
    const loaded = loadMap();
    const item = loaded.draft!.items[0]!;
    const selected = reduceMapEditorState(loaded, {
      kind: "selected",
      selection: { kind: "item", id: item.id },
    });
    const removed = reduceMapEditorState(selected, {
      kind: "edited",
      document: removeItem(selected.draft!, item.id),
    });
    expect(removed.selection).toBeNull();
  });

  it("marks the sent map as saved only when the server wrote it", () => {
    const edited = paintCorner(loadMap(), 7);
    const saving = reduceMapEditorState(edited, { kind: "save_started", document: edited.draft! });
    const refused = reduceMapEditorState(saving, {
      kind: "saved",
      message: { type: "map_file_saved", isSaved: false, isWorldReset: false, problems: [] },
    });
    expect(hasUnsavedChanges(refused)).toBe(true);
    const saved = reduceMapEditorState(saving, {
      kind: "saved",
      message: { type: "map_file_saved", isSaved: true, isWorldReset: false, problems: [] },
    });
    expect(hasUnsavedChanges(saved)).toBe(false);
  });
});
