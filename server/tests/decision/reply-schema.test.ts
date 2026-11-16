import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import type { DecisionTargets, ValidItem } from "../../src/decision/context";
import { buildInteractPrompt, buildInteractReplySchema } from "../../src/decision/interact-prompt";
import { buildDecisionReplySchema } from "../../src/decision/reply-schema";
import { resolveName } from "../../src/decision/resolve-name";
import { readJsonEnumValues } from "../../src/decision/schema-fields";

const targets: DecisionTargets = {
  places: ["bakery", "town square"],
  agents: ["Bob"],
  entities: ["oven"],
  aimOnly: [],
};

const items: ValidItem[] = [{ name: "bread" }, { name: "coin", plural: "coins" }];

const holders = ["chest", "Mara's body"];

const nullReply = {
  thought: "Bob looks hungry.",
  intention: "sell Bob some bread",
  say: null,
  volume: null,
  action: "give",
  verb: null,
  item: "bread",
  from: null,
  target: "bob",
  text: null,
  amount: 1,
  minutes: null,
  mood: null,
};

describe("buildDecisionReplySchema", () => {
  it("normalizes null optional fields", () => {
    const { schema } = buildDecisionReplySchema(targets, items, holders);
    expect(schema.parse(nullReply)).toEqual({
      thought: "Bob looks hungry.",
      intention: "sell Bob some bread",
      action: "give",
      target: "Bob",
      item: "bread",
      amount: 1,
    });
  });

  it("has no note field in the reply or its JSON schema", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders);
    const note = { person: "Bob", text: "owes me" };
    expect(schema.parse({ ...nullReply, note })).not.toHaveProperty("note");
    expect(jsonSchema.properties).not.toHaveProperty("note");
  });

  it("lets walk_to name anything, keeping the spelling of a name it knows", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders);
    const walk = { thought: "Go.", intention: "go", action: "walk_to" };
    expect(schema.parse({ ...walk, target: "brewery" }).target).toBe("brewery");
    expect(schema.parse({ ...walk, target: "The Bakery" }).target).toBe("bakery");
    const properties = jsonSchema.properties as Record<string, { anyOf: unknown[] }>;
    expect(properties.target?.anyOf).toContainEqual({ type: "string" });
  });

  it("validates action enums against current targets", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders);
    const walk = { thought: "Go.", intention: "go", action: "walk_to" };
    expect(schema.safeParse({ ...walk, target: "The Bakery" }).success).toBe(true);
    const give = { ...walk, action: "give", item: "bread", amount: 1 };
    expect(schema.safeParse({ ...give, target: "Zed" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "fly", target: "bakery" }).success).toBe(false);
    expect(schema.safeParse({ ...walk, action: "continue" }).success).toBe(false);
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(readJsonEnumValues(properties.target)).toEqual(["bakery", "town square", "Bob", "oven"]);
    expect(readJsonEnumValues(properties.item)).toEqual(["bread", "coin"]);
    expect(readJsonEnumValues(properties.action)).not.toContain("continue");
  });

  it("accepts a from holder, rejects an unknown one and drops a null one", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders);
    const take = { thought: "Take.", intention: "take", action: "interact", verb: "take" };
    expect(schema.parse({ ...take, item: "coin", from: "The Chest" })).toMatchObject({
      from: "chest",
    });
    expect(schema.safeParse({ ...take, item: "coin", from: "barrel" }).success).toBe(false);
    expect(schema.parse({ ...take, item: "coin", from: null })).not.toHaveProperty("from");
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(Object.keys(properties).indexOf("from")).toBe(
      Object.keys(properties).indexOf("item") + 1,
    );
    expect(properties.from).toEqual({
      anyOf: [{ type: "string", enum: holders }, { type: "null" }],
    });
  });

  it("accepts continue only when interrupted mid-action", () => {
    const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders, {
      isMidActionInterrupt: true,
    });
    expect(
      schema.safeParse({ thought: "Fine.", intention: "bake", action: "continue" }).success,
    ).toBe(true);
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(readJsonEnumValues(properties.action)).toContain("continue");
  });

  it("accepts an item by its plural and parses it to the definition name", () => {
    const { schema } = buildDecisionReplySchema(targets, items, holders);
    const give = { ...nullReply, item: "Coins", amount: 3 };
    expect(schema.parse(give)).toMatchObject({ item: "coin", amount: 3 });
    expect(schema.safeParse({ ...nullReply, item: "knife" }).success).toBe(false);
  });

  it("lets interact name a held item, a target here, or just a verb", () => {
    const { schema } = buildDecisionReplySchema(targets, items, holders);
    const interact = { thought: "Eat.", intention: "eat", action: "interact" };
    expect(schema.safeParse({ ...interact, item: "bread", verb: "eat" }).success).toBe(true);
    expect(schema.safeParse({ ...interact, target: "oven" }).success).toBe(true);
    expect(schema.safeParse({ ...interact, verb: "eat" }).success).toBe(true);
    expect(schema.safeParse(interact).success).toBe(false);
  });

  it("requires the fields an action needs", () => {
    const { schema } = buildDecisionReplySchema(targets, items, holders);
    expect(schema.safeParse({ ...nullReply, amount: null }).success).toBe(false);
    expect(schema.safeParse({ ...nullReply, action: "recall" }).success).toBe(false);
  });

  it("takes words alongside any action", () => {
    const { schema } = buildDecisionReplySchema(targets, items, holders);
    const greeting = { thought: "Hm.", intention: "greet", say: "Morning!" };
    expect(schema.safeParse({ ...greeting, action: "wait" }).success).toBe(true);
  });

  it("lists every field as required in field order for strict mode", () => {
    const { jsonSchema } = buildDecisionReplySchema(targets, items, holders);
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

  it("offers doing none of the verbs", () => {
    const prompt = buildInteractPrompt({
      agentName: "Mara",
      objectName: "oven",
      intention: "warm up",
      options: [{ name: "bake bread", description: "" }],
    });
    expect(prompt).toContain(`- ${config.verbs.declineVerbName}:`);
    const { schema } = buildInteractReplySchema(["bake bread"]);
    expect(schema.parse({ verb: config.verbs.declineVerbName }).verb).toBe(
      config.verbs.declineVerbName,
    );
  });

  it("names the target when the options are narrowed to verbs that can aim at it", () => {
    const input = {
      agentName: "Mara",
      objectName: "wheat",
      intention: "store the harvest",
      options: [{ name: "put", description: "" }],
    };
    expect(buildInteractPrompt({ ...input, targetName: "the oven" })).toContain(
      "## What you can do with the wheat and the oven",
    );
    expect(buildInteractPrompt(input)).toContain("## What you can do with the wheat\n");
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
