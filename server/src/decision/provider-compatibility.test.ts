import { describe, expect, it } from "vitest";
import type { JsonSchema } from "../llm/types";
import {
  buildMorningReplySchema,
  buildNightReplySchema,
  buildWeeklyReplySchema,
} from "../reflection/reply-schemas";
import { buildInteractReplySchema } from "./interact-prompt";
import { buildDecisionReplySchema } from "./reply-schema";

function findEnumsUnderTypeUnions(schema: unknown, path: string): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) => findEnumsUnderTypeUnions(item, `${path}[${index}]`));
  }
  const record = schema as Record<string, unknown>;
  const ownProblem = Array.isArray(record.type) && Array.isArray(record.enum) ? [path] : [];
  const nestedProblems = Object.entries(record).flatMap(([key, value]) =>
    findEnumsUnderTypeUnions(value, `${path}.${key}`),
  );
  return [...ownProblem, ...nestedProblems];
}

const schemasSentToProviders: Record<string, JsonSchema> = {
  decision: buildDecisionReplySchema(
    { places: ["bakery"], agents: ["Bob"], entities: ["oven"], aimOnly: [] },
    [{ name: "bread" }, { name: "coin", plural: "coins" }],
    ["chest"],
    { isMidActionInterrupt: true },
  ).jsonSchema,
  interact: buildInteractReplySchema(["bake bread"]).jsonSchema,
  morning: buildMorningReplySchema().jsonSchema,
  night: buildNightReplySchema().jsonSchema,
  weekly: buildWeeklyReplySchema().jsonSchema,
};

describe("reply schemas sent to providers", () => {
  it.each(Object.entries(schemasSentToProviders))(
    "never puts enum values under a type union in the %s schema",
    (_name, jsonSchema) => {
      expect(findEnumsUnderTypeUnions(jsonSchema, "$")).toEqual([]);
    },
  );
});
