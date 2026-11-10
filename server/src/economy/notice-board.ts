import type { Agent, Note, WorldObject } from "@village/shared";
import { config } from "../config";
import { failWith, type MechanicResult } from "./types";

/** The newest notes on the board, newest first. */
export function readNoticeBoard(object: WorldObject): Note[] {
  const notes = object.state.notes ?? [];
  return notes.slice(-config.noticeBoard.notesShownOnRead).reverse();
}

/** Adds a note (truncated to the length cap), keeping only the newest `maxNotesKept`. */
export function postNote(
  object: WorldObject,
  agent: Agent,
  text: string,
  tick: number,
): MechanicResult<{ object: WorldObject; note: Note }> {
  if (object.kind !== "notice_board") {
    return failWith(`I can't post a note on ${object.name}`);
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return failWith(`I need to write something to post a note on ${object.name}`);
  }
  const note: Note = {
    authorId: agent.id,
    authorName: agent.name,
    text: trimmed.slice(0, config.noticeBoard.maxNoteChars),
    tick,
  };
  const notes = [...(object.state.notes ?? []), note].slice(-config.noticeBoard.maxNotesKept);
  return { isSuccess: true, object: { ...object, state: { ...object.state, notes } }, note };
}
