import { describe, expect, it } from "vitest";
import type { DecisionTargets } from "./context";
import { buildInteractPrompt, buildInteractReplySchema } from "./interact-prompt";
import { buildDecisionReplySchema } from "./reply-schema";
import { resolveName } from "./resolve-name";

const targets: DecisionTargets = {
  places: ["bakery", "town square"],
  agents: ["Bob"],
  objects: ["oven"],
  heldItems: ["bread"],
};

const nullReply = {
  thought: "Bob looks hungry.",
  intention: "sell Bob some bread",
  say: null,
  volume: null,
  action: "give",
  target: "bob",
  interaction: null,
  text: null,
  item: "bread",
  amount: 1,
  query: null,
  minutes: null,
  note: null,
  mood: null,
};

describe("buildDecisionReplySchema", () => {
  it("normalizes null optional fields", () => {
    const { schema } = buildDecisionReplySchema(targets);
    expect(schema.parse(nullReply)).toEqual({
      thought: "Bob looks hungry.",
      intention: "sell Bob some bread",
      action: "give",
      target: "Bob",
      item: "bread",
      amount: 1,
    });
  });

  it("validates action enums against current targets", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets);
    const walk = { thought: "Go.", intention: "go", action: "walk_to" };
    expect(schema.safeParse({ ...walk, target: "The Bakery" }).success).toBe(true);
    expect(schema.safeParse({ ...walk, target: "brewery" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "fly", target: "bakery" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "continue" }).success).toBe(false);
    const properties = jsonSchema.properties as Record<string, { enum?: unknown[] }>;
    expect(properties.target?.enum).toEqual([
      "bakery",
      "town square",
      "Bob",
      "oven",
      "bread",
      null,
    ]);
    expect(properties.action?.enum).not.toContain("continue");
  });

  it("accepts continue only when interrupted mid-action", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, {
      isMidActionInterrupt: true,
    });
    expect(
      schema.safeParse({ thought: "Fine.", intention: "bake", action: "continue" }).success,
    ).toBe(true);
    const properties = jsonSchema.properties as Record<string, { enum?: unknown[] }>;
    expect(properties.action?.enum).toContain("continue");
  });

  it("requires the fields an action needs", () => {
    const { schema } = buildDecisionReplySchema(targets);
    expect(schema.safeParse({ ...nullReply, amount: null }).success).toBe(false);
    expect(
      schema.safeParse({ thought: "Hm.", intention: "think", action: "recall", query: "" }).success,
    ).toBe(false);
  });

  it("lists every field as required in field order for strict mode", () => {
    const { jsonSchema } = buildDecisionReplySchema(targets);
    expect(jsonSchema.required).toEqual(Object.keys(nullReply));
    expect(jsonSchema.additionalProperties).toBe(false);
  });
});

describe("interact second call", () => {
  it("renders the options and validates the chosen interaction", () => {
    const prompt = buildInteractPrompt({
      agentName: "Mara",
      objectName: "notice board",
      intention: "advertise bread",
      options: [
        { name: "read", description: "" },
        { name: "post a note", description: "takes words" },
      ],
    });
    expect(prompt).toContain("- post a note: takes words");
    const { schema } = buildInteractReplySchema(["read", "post a note"]);
    expect(
      schema.parse({ interaction: "Post a note", text: "Bread, 2 coins", minutes: null }),
    ).toEqual({ interaction: "post a note", text: "Bread, 2 coins" });
    expect(schema.safeParse({ interaction: "burn it" }).success).toBe(false);
  });
});

describe("resolveName", () => {
  const candidates = [
    { id: "agent-bob", name: "Bob" },
    { id: "place-square", name: "town square" },
  ];

  it("resolves display names case-insensitively", () => {
    expect(resolveName("  BOB ", candidates)).toBe("agent-bob");
    expect(resolveName("the Town Square", candidates)).toBe("place-square");
    expect(resolveName("Clara", candidates)).toBeNull();
  });
});
