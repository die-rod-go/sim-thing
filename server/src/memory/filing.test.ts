import type { Memory, WorldEvent } from "@village/shared";
import { describe, expect, it } from "vitest";
import type { EventPerception, PerceivedEvent } from "../perception/types";
import { createConversationLog, recordSpeech, type ConversationLog } from "./conversation";
import { fileEvent, fileFirstVisit, filePersonNote, type FilingContext } from "./filing";
import { MemoryIdGenerator, MemoryStore } from "./memory-store";

function makeEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: 1,
    tick: 100,
    actorId: "mara",
    actorName: "Mara",
    kind: "action_started",
    targetId: "oven-1",
    targetName: "oven",
    place: "bakery",
    pos: { x: 3, y: 4 },
    description: "started baking bread at the oven",
    loudness: 3,
    ...overrides,
  };
}

function makeSpeech(words: string, overrides: Partial<WorldEvent> = {}): WorldEvent {
  return makeEvent({
    kind: "said",
    actorId: "bob",
    actorName: "Bob",
    targetId: null,
    targetName: null,
    description: `said "${words}"`,
    speech: { words, volume: "normal" },
    loudness: 8,
    ...overrides,
  });
}

function makePerception(
  agentId: string,
  overrides: Partial<EventPerception> = {},
): EventPerception {
  return { agentId, via: "saw", isInSight: true, hearing: "clear", direction: null, ...overrides };
}

function makeContext(overrides: Partial<FilingContext> = {}): FilingContext {
  return {
    memories: new MemoryStore(),
    idGenerator: new MemoryIdGenerator(),
    conversationLog: createConversationLog(),
    knownNames: ["Mara", "Bob", "Clara", "bakery", "oven", "tavern"],
    knownAgentIdsByListener: {},
    ...overrides,
  };
}

function memoryFor(memories: readonly Memory[], agentId: string): Memory {
  const memory = memories.find((candidate) => candidate.agentId === agentId);
  if (memory === undefined) throw new Error(`No memory filed for ${agentId}`);
  return memory;
}

function logWhereClaraSpokeToBob(tick: number): ConversationLog {
  return recordSpeech(createConversationLog(), {
    event: makeSpeech("Morning, Bob", { actorId: "clara", actorName: "Clara", tick }),
    perceptions: [makePerception("bob")],
  });
}

describe("fileEvent", () => {
  it("files the actor's own action as did", () => {
    const memories = fileEvent({ event: makeEvent(), perceptions: [] }, makeContext());
    const memory = memoryFor(memories, "mara");
    expect(memory.bucket).toBe("did");
    expect(memory.text).toBe("I started baking bread at the oven");
    expect(memory.tags).toEqual(expect.arrayContaining(["mara", "oven", "bakery"]));
    expect(memory.strength).toBe(1);
    expect(memory.lastRecalledTick).toBeNull();
  });

  it("files a give for the recipient", () => {
    const event = makeEvent({
      kind: "gave",
      targetId: "clara",
      targetName: "Clara",
      description: "gave Clara 2 bread",
      item: "bread",
      amount: 2,
    });
    const memories = fileEvent({ event, perceptions: [makePerception("clara")] }, makeContext());
    expect(memories).toHaveLength(2);
    expect(memoryFor(memories, "mara").text).toBe("I gave Clara 2 bread");
    const recipientMemory = memoryFor(memories, "clara");
    expect(recipientMemory.bucket).toBe("did");
    expect(recipientMemory.text).toBe("Mara gave me 2 bread");
    expect(recipientMemory.tags).toEqual(expect.arrayContaining(["mara", "clara", "bread"]));
  });

  it("files the speaker's own speech under conversations", () => {
    const memories = fileEvent(
      { event: makeSpeech("Fresh bread today"), perceptions: [] },
      makeContext(),
    );
    const memory = memoryFor(memories, "bob");
    expect(memory.bucket).toBe("conversations");
    expect(memory.text).toBe('I said: "Fresh bread today"');
  });

  it("files speech for a conversation participant under conversations", () => {
    const context = makeContext({ conversationLog: logWhereClaraSpokeToBob(95) });
    const event = makeSpeech("Have you seen Mara at the tavern?");
    const memories = fileEvent({ event, perceptions: [makePerception("clara")] }, context);
    const memory = memoryFor(memories, "clara");
    expect(memory.bucket).toBe("conversations");
    expect(memory.text).toBe('Bob said: "Have you seen Mara at the tavern?"');
    expect(memory.tags).toEqual(expect.arrayContaining(["bob", "bakery", "mara", "tavern"]));
  });

  it("files speech heard by a non-participant as overheard", () => {
    const context = makeContext({ conversationLog: logWhereClaraSpokeToBob(80) });
    const event = makeSpeech("Keep this quiet", {
      speech: { words: "Keep this quiet", volume: "whisper" },
    });
    const memories = fileEvent({ event, perceptions: [makePerception("clara")] }, context);
    const memory = memoryFor(memories, "clara");
    expect(memory.bucket).toBe("overheard");
    expect(memory.text).toBe('I overheard Bob whisper: "Keep this quiet"');
  });

  it("files muffled speech without the words", () => {
    const perceived: PerceivedEvent = {
      event: makeSpeech("The secret recipe is honey"),
      perceptions: [
        makePerception("clara", { isInSight: false, hearing: "muffled", via: "heard_muffled" }),
        makePerception("mara", { isInSight: false, hearing: "muffled", via: "heard_muffled" }),
      ],
    };
    const context = makeContext({ knownAgentIdsByListener: { clara: ["bob"] } });
    const memories = fileEvent(perceived, context);
    const claraMemory = memoryFor(memories, "clara");
    expect(claraMemory.bucket).toBe("overheard");
    expect(claraMemory.text).toBe(
      "I heard Bob's voice from the bakery but couldn't make out the words",
    );
    expect(claraMemory.text).not.toContain("honey");
    expect(memoryFor(memories, "mara").text).toBe(
      "I heard someone's voice from the bakery but couldn't make out the words",
    );
    expect(memoryFor(memories, "mara").tags).not.toContain("bob");
  });

  it("files another agent's action in sight under seen", () => {
    const memories = fileEvent(
      { event: makeEvent(), perceptions: [makePerception("bob")] },
      makeContext(),
    );
    const memory = memoryFor(memories, "bob");
    expect(memory.bucket).toBe("seen");
    expect(memory.text).toBe("I saw that Mara started baking bread at the oven");
  });

  it("files an out-of-sight sound with its direction under seen", () => {
    const event = makeEvent({
      place: "woodlot",
      targetName: "trees",
      description: "started chopping wood at the trees",
      loudness: 15,
    });
    const perception = makePerception("bob", {
      isInSight: false,
      via: "heard",
      direction: "north",
    });
    const memories = fileEvent({ event, perceptions: [perception] }, makeContext());
    const memory = memoryFor(memories, "bob");
    expect(memory.bucket).toBe("seen");
    expect(memory.text).toBe(
      "I heard sounds from the woodlot, to the north: someone started chopping wood at the trees",
    );
    expect(memory.tags).toContain("woodlot");
    expect(memory.tags).not.toContain("mara");
  });

  it("skips a duplicate memory within 30 ticks", () => {
    const store = new MemoryStore();
    const context = makeContext({ memories: store });
    store.addAll(fileEvent({ event: makeEvent({ tick: 100 }), perceptions: [] }, context));
    const repeated = fileEvent({ event: makeEvent({ tick: 125 }), perceptions: [] }, context);
    expect(repeated).toHaveLength(0);
    const later = fileEvent({ event: makeEvent({ tick: 131 }), perceptions: [] }, context);
    expect(later).toHaveLength(1);
  });

  it("files an action's start and its result separately", () => {
    const store = new MemoryStore();
    const context = makeContext({ memories: store });
    store.addAll(fileEvent({ event: makeEvent(), perceptions: [] }, context));
    const finished = makeEvent({
      kind: "action_finished",
      tick: 101,
      description: "finished baking bread at the oven, making 4 bread",
    });
    expect(fileEvent({ event: finished, perceptions: [] }, context)).toHaveLength(1);
  });

  it("keeps memories to 200 characters", () => {
    const words = "bread ".repeat(80);
    const memories = fileEvent({ event: makeSpeech(words), perceptions: [] }, makeContext());
    const memory = memoryFor(memories, "bob");
    expect(memory.text.length).toBe(200);
    expect(memory.text.endsWith("…")).toBe(true);
  });

  it("gives memories deterministic unique ids", () => {
    const perceived = { event: makeEvent(), perceptions: [makePerception("bob")] };
    const first = fileEvent(perceived, makeContext()).map((memory) => memory.id);
    const second = fileEvent(perceived, makeContext()).map((memory) => memory.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("fileFirstVisit", () => {
  it("files a first visit with the objects found there under places", () => {
    const memory = fileFirstVisit("mara", "bakery", ["oven", "bench"], 10, new MemoryIdGenerator());
    expect(memory.bucket).toBe("places");
    expect(memory.text).toBe(
      "I visited the bakery for the first time; I found the oven and the bench here",
    );
    expect(memory.tags).toEqual(["bakery", "oven", "bench"]);
  });
});

describe("filePersonNote", () => {
  it("files a note about a person under people, tagged with the person", () => {
    const memory = filePersonNote(
      "mara",
      "Bob",
      "owes me 2 coins from the tavern",
      10,
      new MemoryIdGenerator(),
      ["tavern"],
    );
    expect(memory.bucket).toBe("people");
    expect(memory.text).toBe("About Bob: owes me 2 coins from the tavern");
    expect(memory.tags).toEqual(["bob", "tavern"]);
  });
});
