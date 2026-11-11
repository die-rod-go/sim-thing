import { describe, expect, it } from "vitest";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { createFakeResponder } from "./fake-responder";

const ATTEMPTS = 200;

function buildTavernRequest() {
  const { jsonSchema } = buildDecisionReplySchema(
    { places: ["tavern"], agents: [], entities: ["tavern chest"], aimOnly: [] },
    [{ name: "bread" }, { name: "bandage", plural: "bandages" }],
  );
  const prompt = [
    "You are Mara, the baker.",
    "You are at the tavern.",
    "Here: tavern chest (take; holding 2 bandages)",
    "You carry: 2 bread (eat, drop, put).",
  ].join("\n");
  return { prompt, jsonSchema, schemaName: "decision_reply", maxTokens: 500 };
}

async function collectInteractReplies(): Promise<Record<string, unknown>[]> {
  const responder = createFakeResponder();
  const request = buildTavernRequest();
  const replies: Record<string, unknown>[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const answer = await responder(request, attempt);
    const text = typeof answer === "string" || answer instanceof Error ? null : answer.text;
    if (typeof text !== "string") throw new Error("the fake responder should answer with text");
    const reply: unknown = JSON.parse(text);
    if (typeof reply === "object" && reply !== null) replies.push(reply as Record<string, unknown>);
  }
  return replies.filter((reply) => reply.target === "tavern chest");
}

describe("the fake responder with containers", () => {
  it("takes something that is inside the chest", async () => {
    const takes = (await collectInteractReplies()).filter((reply) => reply.verb === "take");
    expect(takes.length).toBeGreaterThan(0);
    expect(new Set(takes.map((reply) => reply.item))).toEqual(new Set(["bandage"]));
  });

  it("puts something it carries into the chest", async () => {
    const puts = (await collectInteractReplies()).filter((reply) => reply.verb === "put");
    expect(puts.length).toBeGreaterThan(0);
    expect(new Set(puts.map((reply) => reply.item))).toEqual(new Set(["bread"]));
    expect(new Set(puts.map((reply) => reply.target))).toEqual(new Set(["tavern chest"]));
  });
});
