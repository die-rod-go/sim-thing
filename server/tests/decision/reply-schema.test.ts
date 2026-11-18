import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import type { DecisionTargets, ValidItem } from "../../src/decision/context";
import { buildInteractPrompt, buildInteractReplySchema } from "../../src/decision/interact-prompt";
import { buildDecisionReplySchema } from "../../src/decision/reply-schema";
import { resolveName } from "../../src/decision/resolve-name";
import { readJsonEnumValues } from "../../src/decision/schema-fields";
import type { JsonSchema } from "../../src/llm/types";

const targets: DecisionTargets = {
  places: ["bakery", "town square"],
  agents: ["Bob"],
  entities: ["oven"],
  aimOnly: [],
};

const items: ValidItem[] = [{ name: "bread" }, { name: "coin", plural: "coins" }];

const holders = ["chest", "Mara's body"];

const nullAct = {
  action: "give",
  verb: null,
  item: "bread",
  from: null,
  target: "bob",
  text: null,
  amount: 1,
  inReturn: null,
  inReturnAmount: null,
  minutes: null,
  say: null,
  volume: null,
};

const nullReply = {
  thought: "Bob looks hungry.",
  intention: "sell Bob some bread",
  acts: [nullAct],
  mood: null,
  offer: null,
  done: null,
  dropped: null,
  added: null,
  remember: null,
};

/** A reply with the given acts and the required fields filled in. */
function reply(...acts: Record<string, unknown>[]) {
  return { thought: "Hm.", intention: "go on", acts };
}

function readActProperties(jsonSchema: JsonSchema): Record<string, unknown> {
  const properties = jsonSchema.properties as Record<string, { items: JsonSchema }>;
  return properties.acts?.items.properties as Record<string, unknown>;
}

describe("buildDecisionReplySchema", () => {
  const { schema, jsonSchema } = buildDecisionReplySchema(targets, items, holders);

  it("normalizes null optional fields", () => {
    expect(schema.parse(nullReply)).toEqual({
      thought: "Bob looks hungry.",
      intention: "sell Bob some bread",
      acts: [{ action: "give", target: "Bob", item: "bread", amount: 1 }],
    });
  });

  it("accepts an answer to an offer alongside any act", () => {
    expect(schema.parse({ ...reply({ action: "wait" }), offer: "Accept" }).offer).toBe("accept");
    expect(schema.safeParse({ ...reply({ action: "wait" }), offer: "maybe" }).success).toBe(false);
    const properties = jsonSchema.properties as Record<string, { anyOf: unknown[] }>;
    expect(properties.offer?.anyOf).toContainEqual({ type: "string", enum: ["accept", "decline"] });
  });

  it("lets walk_to name anything, keeping the spelling of a name it knows", () => {
    const walkTo = (target: string) => schema.parse(reply({ action: "walk_to", target }));
    expect(walkTo("brewery").acts[0]?.target).toBe("brewery");
    expect(walkTo("The Bakery").acts[0]?.target).toBe("bakery");
    const target = readActProperties(jsonSchema).target as { anyOf: unknown[] };
    expect(target.anyOf).toContainEqual({ type: "string" });
  });

  it("checks the first act against what is here, and offers the names", () => {
    const give = { action: "give", item: "bread", amount: 1 };
    expect(schema.safeParse(reply({ ...give, target: "Zed" })).success).toBe(false);
    expect(schema.safeParse(reply({ action: "fly", target: "bakery" })).success).toBe(false);
    expect(schema.safeParse(reply({ action: "continue" })).success).toBe(false);
    const properties = readActProperties(jsonSchema);
    expect(readJsonEnumValues(properties.target)).toEqual(["bakery", "town square", "Bob", "oven"]);
    expect(readJsonEnumValues(properties.item)).toEqual(["bread", "coin"]);
    expect(readJsonEnumValues(properties.action)).not.toContain("continue");
    expect(readJsonEnumValues(properties.action)).toContain("follow");
  });

  it("lets later acts name what isn't here yet, to be resolved when they start", () => {
    const later = { action: "give", target: "Zed", item: "pie", amount: 1 };
    const parsed = schema.parse(reply({ action: "walk_to", target: "bakery" }, later));
    expect(parsed.acts[1]).toEqual(later);
    const continuing = reply({ action: "wait" }, { action: "continue" });
    expect(schema.safeParse(continuing).success).toBe(false);
  });

  it("keeps no more acts than allowed, and needs at least one", () => {
    const waits = Array.from({ length: config.decision.maxActs + 2 }, () => ({ action: "wait" }));
    expect(schema.parse(reply(...waits)).acts).toHaveLength(config.decision.maxActs);
    expect(schema.safeParse(reply()).success).toBe(false);
  });

  it("accepts a from holder, rejects an unknown one and drops a null one", () => {
    const take = { action: "interact", verb: "take", item: "coin" };
    expect(schema.parse(reply({ ...take, from: "The Chest" })).acts[0]).toMatchObject({
      from: "chest",
    });
    expect(schema.safeParse(reply({ ...take, from: "barrel" })).success).toBe(false);
    expect(schema.parse(reply({ ...take, from: null })).acts[0]).not.toHaveProperty("from");
  });

  it("accepts continue only when interrupted mid-action", () => {
    const interrupted = buildDecisionReplySchema(targets, items, holders, {
      isMidActionInterrupt: true,
    });
    expect(interrupted.schema.safeParse(reply({ action: "continue" })).success).toBe(true);
    const properties = readActProperties(interrupted.jsonSchema);
    expect(readJsonEnumValues(properties.action)).toContain("continue");
  });

  it("accepts an item by its plural and parses it to the definition name", () => {
    const coins = { ...nullAct, item: "Coins", amount: 3 };
    expect(schema.parse({ ...nullReply, acts: [coins] }).acts[0]).toMatchObject({
      item: "coin",
      amount: 3,
    });
    const knife = { ...nullAct, item: "knife" };
    expect(schema.safeParse({ ...nullReply, acts: [knife] }).success).toBe(false);
  });

  it("lets interact name a held item, a target here, or just a verb", () => {
    const interact = { action: "interact" };
    expect(schema.safeParse(reply({ ...interact, item: "bread", verb: "eat" })).success).toBe(true);
    expect(schema.safeParse(reply({ ...interact, target: "oven" })).success).toBe(true);
    expect(schema.safeParse(reply({ ...interact, verb: "eat" })).success).toBe(true);
    expect(schema.safeParse(reply(interact)).success).toBe(false);
  });

  it("requires the fields an act needs, in later acts too", () => {
    const noAmount = { ...nullReply, acts: [{ ...nullAct, amount: null }] };
    expect(schema.safeParse(noAmount).success).toBe(false);
    expect(schema.safeParse(reply({ action: "wait" }, { action: "follow" })).success).toBe(false);
  });

  it("lets a give ask for something back, and needs how many", () => {
    const give = { action: "give", target: "Bob", item: "bread", amount: 1, inReturn: "coins" };
    expect(schema.parse(reply({ ...give, inReturnAmount: 4 })).acts[0]).toMatchObject({
      inReturn: "coins",
      inReturnAmount: 4,
    });
    expect(schema.safeParse(reply(give)).success).toBe(false);
  });

  it("takes words with each act", () => {
    const parsed = schema.parse(
      reply({ action: "wait", say: "Morning!" }, { action: "wait", say: "Bye!", volume: "Shout" }),
    );
    expect(parsed.acts.map((act) => [act.say, act.volume])).toEqual([
      ["Morning!", undefined],
      ["Bye!", "shout"],
    ]);
  });

  it("lists every field as required in field order for strict mode", () => {
    expect(jsonSchema.required).toEqual(Object.keys(nullReply));
    expect(jsonSchema.additionalProperties).toBe(false);
    const properties = jsonSchema.properties as Record<string, { items: JsonSchema }>;
    expect(properties.acts?.items.required).toEqual(Object.keys(nullAct));
  });

  it("lets a reckoning alone write the whole new agenda", () => {
    const reckoning = buildDecisionReplySchema(targets, items, holders, { isReckoning: true });
    expect(reckoning.jsonSchema.properties).toHaveProperty("agenda");
    expect(jsonSchema.properties).not.toHaveProperty("agenda");
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
