import { describe, expect, it } from "vitest";
import { config } from "../../config";
import { createEntity, locateInside } from "../../items/entity-store";
import { writeField } from "../../items/thing-writes";
import { contextOf, memoryTexts } from "../combat-test-kit";
import { OPEN_GROUND } from "../rule-test-kit";
import type { TestSim } from "../test-sim";
import { runVerb, setUpSteps } from "./step-test-kit";

function pinNote(sim: TestSim, boardId: string, text: string, author: string): void {
  const note = createEntity(sim.state, "note", locateInside(boardId));
  const thing = { kind: "entity", entityId: note.id } as const;
  writeField(contextOf(sim), thing, "writing.text", text);
  writeField(contextOf(sim), thing, "writing.author", author);
}

function placeBoard(sim: TestSim) {
  return createEntity(sim.state, "notice_board", { kind: "tile", place: "x", pos: OPEN_GROUND });
}

describe("read", () => {
  it("files a seen memory of each note on the board, with who wrote it", () => {
    const sim = setUpSteps();
    const board = placeBoard(sim);
    pinNote(sim, board.id, "Bread at dawn", "Tobias");
    runVerb(sim, "read", { items: [board] });
    expect(memoryTexts(sim, "mara")).toContain(
      'I read a note from Tobias on the notice board: "Bread at dawn"',
    );
    const memory = sim.state.memoryStore
      .listByAgent("mara")
      .find((candidate) => candidate.text.includes("Bread at dawn"));
    expect(memory?.bucket).toBe("seen");
  });

  it("reads only the newest notes, newest first", () => {
    const sim = setUpSteps();
    const board = placeBoard(sim);
    const total = config.reading.thingsShownOnRead + 2;
    for (let index = 0; index < total; index += 1) {
      pinNote(sim, board.id, `note number ${index}`, "Tobias");
    }
    runVerb(sim, "read", { items: [board] });
    const texts = memoryTexts(sim, "mara").filter((text) => text.includes("note number"));
    expect(texts).toHaveLength(config.reading.thingsShownOnRead);
    expect(texts.some((text) => text.includes("note number 0"))).toBe(false);
    expect(texts.some((text) => text.includes(`note number ${total - 1}`))).toBe(true);
  });

  it("does not remember the same text twice, and skips empty notes", () => {
    const sim = setUpSteps();
    const board = placeBoard(sim);
    pinNote(sim, board.id, "Same words", "Tobias");
    createEntity(sim.state, "note", locateInside(board.id));
    runVerb(sim, "read", { items: [board] });
    runVerb(sim, "read", { items: [board] });
    expect(memoryTexts(sim, "mara").filter((text) => text.includes("Same words"))).toHaveLength(1);
  });

  it("remembers briefly that there was nothing to read on an empty board", () => {
    const sim = setUpSteps();
    const board = placeBoard(sim);
    runVerb(sim, "read", { items: [board] });
    expect(sim.agent("mara").workingMemory.at(-1)).toMatch(
      /There was nothing to read on the notice board/,
    );
  });

  it("reads the text on the thing itself", () => {
    const sim = setUpSteps();
    const note = createEntity(sim.state, "note", { kind: "tile", place: "x", pos: OPEN_GROUND });
    const thing = { kind: "entity", entityId: note.id } as const;
    writeField(contextOf(sim), thing, "writing.text", "Back soon");
    writeField(contextOf(sim), thing, "writing.author", "Edwin");
    runVerb(sim, "read", { items: [note] });
    expect(memoryTexts(sim, "mara")).toContain('I read a note from Edwin: "Back soon"');
  });
});
