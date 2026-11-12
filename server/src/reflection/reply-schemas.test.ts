import { describe, expect, it } from "vitest";
import type { JsonSchema } from "../llm/types";
import {
  buildMorningReplySchema,
  buildNightReplySchema,
  buildWeeklyReplySchema,
} from "./reply-schemas";

function findArrayLimitsStrictOutputRejects(schema: unknown, path = "$"): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) =>
      findArrayLimitsStrictOutputRejects(item, `${path}[${index}]`),
    );
  }
  if (typeof schema !== "object" || schema === null) return [];
  const record = schema as Record<string, unknown>;
  const problems: string[] = [];
  if ("maxItems" in record) problems.push(`${path}.maxItems`);
  if (typeof record.minItems === "number" && record.minItems > 1) {
    problems.push(`${path}.minItems`);
  }
  return [
    ...problems,
    ...Object.entries(record).flatMap(([key, value]) =>
      findArrayLimitsStrictOutputRejects(value, `${path}.${key}`),
    ),
  ];
}

describe("reflection reply schemas", () => {
  const jsonSchemas: Record<string, JsonSchema> = {
    morning: buildMorningReplySchema().jsonSchema,
    night: buildNightReplySchema().jsonSchema,
    weekly: buildWeeklyReplySchema().jsonSchema,
  };

  it.each(Object.entries(jsonSchemas))(
    "sends a %s schema without array limits strict structured output rejects",
    (_passName, jsonSchema) => {
      expect(findArrayLimitsStrictOutputRejects(jsonSchema)).toEqual([]);
    },
  );

  it("trims a night reply with too many insights instead of rejecting it", () => {
    const { schema } = buildNightReplySchema();
    const manyInsights = Array.from({ length: 20 }, (_unused, index) => ({
      text: `Idea ${index}`,
    }));
    const parsed = schema.parse({
      summary: "A long day.",
      moodEntry: "Tired.",
      insights: manyInsights,
      dossiers: [],
    });
    expect(parsed.insights.length).toBeLessThan(manyInsights.length);
  });
});
