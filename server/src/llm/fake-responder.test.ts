import { describe, expect, it } from "vitest";
import { config } from "../config";
import { nullableJsonEnum, strictJsonObject } from "../decision/schema-fields";
import { createFakeResponder } from "./fake-responder";

const ATTEMPTS = 300;

function buildTavernRequest() {
  const jsonSchema = strictJsonObject({
    action: { type: "string", enum: ["interact", "wait"] },
    target: nullableJsonEnum(["tavern chest", "Tobias", "yourself"]),
    verb: { type: ["string", "null"] },
    item: nullableJsonEnum(["bread", "coin", "oven", "tavern chest"]),
    from: nullableJsonEnum(["tavern chest"]),
  });
  const prompt = [
    "You are Mara, the baker.",
    "You are at the tavern.",
    "Here:",
    "- oven (bake bread)",
    "- tavern chest, holding 2 coins, 3 bread",
    "  - 2 coins (take)",
    "  - 3 bread (take)",
    "You carry:",
    "- 2 bread (eat, drop)",
  ].join("\n");
  return { prompt, jsonSchema, schemaName: "decision_reply", maxTokens: 500 };
}

async function collectReplies(): Promise<Record<string, unknown>[]> {
  const responder = createFakeResponder();
  const request = buildTavernRequest();
  const replies: Record<string, unknown>[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const answer = await responder(request, attempt);
    const text = typeof answer === "string" || answer instanceof Error ? null : answer.text;
    if (typeof text !== "string") throw new Error("the fake responder should answer with text");
    replies.push(JSON.parse(text) as Record<string, unknown>);
  }
  return replies;
}

describe("the fake responder", () => {
  it("names a thing here in item, not in target", async () => {
    const bakes = (await collectReplies()).filter((reply) => reply.verb === "bake bread");
    expect(bakes.length).toBeGreaterThan(0);
    expect(new Set(bakes.map((reply) => reply.item))).toEqual(new Set(["oven"]));
    expect(bakes.every((reply) => reply.from === null)).toBe(true);
  });

  it("names a holder's content in item with the holder in from", async () => {
    const takes = (await collectReplies()).filter((reply) => reply.verb === "take");
    expect(takes.length).toBeGreaterThan(0);
    expect(new Set(takes.map((reply) => reply.item))).toEqual(new Set(["coin", "bread"]));
    expect(new Set(takes.map((reply) => reply.from))).toEqual(new Set(["tavern chest"]));
  });

  it("sometimes aims a carried item's verb at something here or itself", async () => {
    const eats = (await collectReplies()).filter((reply) => reply.verb === "drop");
    const aims = new Set(eats.map((reply) => reply.target));
    expect(aims.has(null)).toBe(true);
    expect([...aims].some((aim) => aim === "yourself" || aim === "tavern chest")).toBe(true);
  });

  it("has no per-verb item rules in config", () => {
    expect("itemChoosingVerbs" in config.llm.fakeResponder).toBe(false);
  });
});
