import { describe, expect, it } from "vitest";
import type { DecisionTargets, ValidItem } from "./context";
import { buildInteractPrompt, buildInteractReplySchema } from "./interact-prompt";
import { buildDecisionReplySchema } from "./reply-schema";
import { resolveName } from "./resolve-name";
import { readJsonEnumValues } from "./schema-fields";

const targets: DecisionTargets = {
  places: ["bakery", "town square"],
  agents: ["Bob"],
  entities: ["oven"],
  aimOnly: [],
};

const items: ValidItem[] = [{ name: "bread" }, { name: "coin", plural: "coins" }];

const nullReply = {
  thought: "Bob looks hungry.",
  intention: "sell Bob some bread",
  say: null,
  volume: null,
  action: "give",
  target: "bob",
  verb: null,
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
    const { schema } = buildDecisionReplySchema(targets, items);
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
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items);
    const walk = { thought: "Go.", intention: "go", action: "walk_to" };
    expect(schema.safeParse({ ...walk, target: "The Bakery" }).success).toBe(true);
    expect(schema.safeParse({ ...walk, target: "brewery" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "fly", target: "bakery" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "continue" }).success).toBe(false);
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(readJsonEnumValues(properties.target)).toEqual(["bakery", "town square", "Bob", "oven"]);
    expect(readJsonEnumValues(properties.item)).toEqual(["bread", "coin"]);
    expect(readJsonEnumValues(properties.action)).not.toContain("continue");
  });

  it("accepts continue only when interrupted mid-action", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, {
      isMidActionInterrupt: true,
    });
    expect(
      schema.safeParse({ thought: "Fine.", intention: "bake", action: "continue" }).success,
    ).toBe(true);
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(readJsonEnumValues(properties.action)).toContain("continue");
  });

  it("accepts an item by its plural and parses it to the definition name", () => {
    const { schema } = buildDecisionReplySchema(targets, items);
    const give = { ...nullReply, item: "Coins", amount: 3 };
    expect(schema.parse(give)).toMatchObject({ item: "coin", amount: 3 });
    expect(schema.safeParse({ ...nullReply, item: "knife" }).success).toBe(false);
  });

  it("lets interact name a held item, a target here, or just a verb", () => {
    const { schema } = buildDecisionReplySchema(targets, items);
    const interact = { thought: "Eat.", intention: "eat", action: "interact" };
    expect(schema.safeParse({ ...interact, item: "bread", verb: "eat" }).success).toBe(true);
    expect(schema.safeParse({ ...interact, target: "oven" }).success).toBe(true);
    expect(schema.safeParse({ ...interact, verb: "eat" }).success).toBe(true);
    expect(schema.safeParse(interact).success).toBe(false);
  });

  it("requires the fields an action needs", () => {
    const { schema } = buildDecisionReplySchema(targets, items);
    expect(schema.safeParse({ ...nullReply, amount: null }).success).toBe(false);
    expect(
      schema.safeParse({ thought: "Hm.", intention: "think", action: "recall", query: "" }).success,
    ).toBe(false);
    expect(schema.safeParse({ thought: "Hm.", intention: "greet", action: "say" }).success).toBe(
      false,
    );
  });

  it("lists every field as required in field order for strict mode", () => {
    const { jsonSchema } = buildDecisionReplySchema(targets, items);
    expect(jsonSchema.required).toEqual(Object.keys(nullReply));
    expect(jsonSchema.additionalProperties).toBe(false);
  });
});

describe("interact second call", () => {
  it("renders the options and validates the chosen verb", () => {
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
    expect(schema.parse({ verb: "Post a note", text: "Bread, 2 coins", minutes: null })).toEqual({
      verb: "post a note",
      text: "Bread, 2 coins",
    });
    expect(schema.safeParse({ verb: "burn it" }).success).toBe(false);
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
