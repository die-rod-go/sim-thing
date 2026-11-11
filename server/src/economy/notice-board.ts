import type { Agent, Entity, Note } from "@village/shared";
import { config } from "../config";
import { failWith, type MechanicResult } from "./types";

/** The newest notes on the board, newest first. */
export function readNoticeBoard(board: Entity): Note[] {
  const notes = board.state.notes ?? [];
  return notes.slice(-config.noticeBoard.notesShownOnRead).reverse();
}

/** Why a note can't be posted, or null. */
export function findPostBlocker(boardName: string, text: string): string | null {
  return text.trim().length === 0
    ? `I need to write something to post a note on the ${boardName}`
    : null;
}

/**
 * Adds a note (truncated to the length cap), keeping only the newest `maxNotes` from the board's
 * `notes` component.
 */
export function postNote(
  board: Entity,
  boardName: string,
  agent: Agent,
  text: string,
  tick: number,
  maxNotes: number,
): MechanicResult<{ board: Entity; note: Note }> {
  const blocker = findPostBlocker(boardName, text);
  if (blocker !== null) return failWith(blocker);
  const note: Note = {
    authorId: agent.id,
    authorName: agent.name,
    text: text.trim().slice(0, config.noticeBoard.maxNoteChars),
    tick,
  };
  const notes = [...(board.state.notes ?? []), note].slice(-maxNotes);
  return { isSuccess: true, board: { ...board, state: { ...board.state, notes } }, note };
}
