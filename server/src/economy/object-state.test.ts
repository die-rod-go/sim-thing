import { describe, expect, it } from "vitest";
import type { WorldObject } from "@village/shared";
import { config } from "../config";
import { postNote, readNoticeBoard } from "./notice-board";
import { regrowStocks, setDoorOpen } from "./object-state";
import { makeAgent, makeObject } from "./test-fixtures";
import { MINUTES_PER_DAY } from "./types";

describe("stock regrowth", () => {
  it("the wheat field regrows 12 per day up to capacity", () => {
    let objects: WorldObject[] = [makeObject("wheat_field", "wheat field", { stock: 0 })];
    for (let minute = 0; minute < MINUTES_PER_DAY; minute++) {
      objects = regrowStocks(objects, 1);
    }
    expect(objects[0]?.state.stock).toBeCloseTo(12, 6);
    objects = regrowStocks(objects, 60);
    expect(objects[0]?.state.stock).toBe(config.objects.wheat_field.stock.capacity);
  });

  it("leaves objects without a stock alone", () => {
    const oven = makeObject("oven", "oven");
    expect(regrowStocks([oven], 60)[0]).toBe(oven);
  });
});

describe("doors", () => {
  it("opens a closed door", () => {
    const result = setDoorOpen(makeObject("door", "tavern door", { isOpen: false }), true);
    expect(result.isSuccess && result.object.state.isOpen).toBe(true);
  });

  it("fails to close a door that is already closed", () => {
    expect(setDoorOpen(makeObject("door", "tavern door", { isOpen: false }), false)).toEqual({
      isSuccess: false,
      reason: "The tavern door is already closed",
    });
  });
});

describe("notice board", () => {
  function postMany(count: number): WorldObject {
    let board = makeObject("notice_board", "notice board");
    for (let index = 0; index < count; index++) {
      const result = postNote(board, makeAgent(), `note ${index}`, index);
      if (!result.isSuccess) {
        throw new Error(result.reason);
      }
      board = result.object;
    }
    return board;
  }

  it("posting a note keeps the newest notes", () => {
    const board = postMany(config.noticeBoard.maxNotesKept + 3);
    const notes = board.state.notes ?? [];
    expect(notes).toHaveLength(config.noticeBoard.maxNotesKept);
    expect(notes[0]?.text).toBe("note 3");
  });

  it("reading the board returns the newest 5", () => {
    const notes = readNoticeBoard(postMany(8));
    expect(notes.map((note) => note.text)).toEqual([
      "note 7",
      "note 6",
      "note 5",
      "note 4",
      "note 3",
    ]);
  });

  it("truncates long notes", () => {
    const board = makeObject("notice_board", "notice board");
    const result = postNote(board, makeAgent(), "x".repeat(500), 0);
    expect(result.isSuccess && result.note.text.length).toBe(config.noticeBoard.maxNoteChars);
  });
});
