import type { WorldEvent } from "@village/shared";
import { describe, expect, it } from "vitest";
import type { EventPerception, PerceivedEvent } from "../../src/perception/types";
import {
  createConversationLog,
  recordSpeech,
  type ConversationLog,
} from "../../src/memory/conversation";
import { fileEvent, type FiledEvent, type FilingContext } from "../../src/memory/filing";

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
    conversationLog: createConversationLog(),
    knownAgentIdsByListener: {},
    nameLocation: (place) => place,
    ...overrides,
  };
}

function memoryFor(memories: readonly FiledEvent[], agentId: string): FiledEvent {
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
  it("files the actor's own action in the first person", () => {
    const memories = fileEvent({ event: makeEvent(), perceptions: [] }, makeContext());
    const memory = memoryFor(memories, "mara");
    expect(memory.text).toBe("I started baking bread at the oven");
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
    expect(recipientMemory.text).toBe("Mara gave me 2 bread");
  });

  it("files the speaker's own speech as said", () => {
    const memories = fileEvent(
      { event: makeSpeech("Fresh bread today"), perceptions: [] },
      makeContext(),
    );
    const memory = memoryFor(memories, "bob");
    expect(memory.text).toBe('I said: "Fresh bread today"');
  });

  it("files speech for a conversation participant as said", () => {
    const context = makeContext({ conversationLog: logWhereClaraSpokeToBob(95) });
    const event = makeSpeech("Have you seen Mara at the tavern?");
    const memories = fileEvent({ event, perceptions: [makePerception("clara")] }, context);
    const memory = memoryFor(memories, "clara");
    expect(memory.text).toBe('Bob said: "Have you seen Mara at the tavern?"');
  });

  it("files speech heard by a non-participant as overheard", () => {
    const context = makeContext({ conversationLog: logWhereClaraSpokeToBob(80) });
    const event = makeSpeech("Keep this quiet", {
      speech: { words: "Keep this quiet", volume: "whisper" },
    });
    const memories = fileEvent({ event, perceptions: [makePerception("clara")] }, context);
    const memory = memoryFor(memories, "clara");
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
    expect(claraMemory.text).toBe(
      "I heard Bob's voice from the bakery but couldn't make out the words",
    );
    expect(claraMemory.text).not.toContain("honey");
    expect(memoryFor(memories, "mara").text).toBe(
      "I heard someone's voice from the bakery but couldn't make out the words",
    );
  });

  it("files another agent's action in sight as seen", () => {
    const memories = fileEvent(
      { event: makeEvent(), perceptions: [makePerception("bob")] },
      makeContext(),
    );
    const memory = memoryFor(memories, "bob");
    expect(memory.text).toBe("I saw that Mara started baking bread at the oven");
  });

  it("files an out-of-sight sound with its direction", () => {
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
    expect(memory.text).toBe(
      "I heard sounds from the woodlot, to the north: someone started chopping wood at the trees",
    );
  });
});
