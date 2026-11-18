import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { computeWeightedTokens } from "../../src/llm/token-budget";

describe("computeWeightedTokens", () => {
  it("counts cache reads and writes as they bill against fresh input", () => {
    const { cacheRead, cacheWrite } = config.llm.tokenWeights;
    const usage = {
      promptTokens: 10_000,
      completionTokens: 200,
      cacheReadTokens: 6_000,
      cacheWriteTokens: 2_000,
    };
    const expected = 2_000 + 6_000 * cacheRead + 2_000 * cacheWrite + 200;
    expect(computeWeightedTokens(usage)).toBe(Math.round(expected));
  });

  it("counts every prompt token in full when the provider reports no caching", () => {
    const usage = {
      promptTokens: 1_000,
      completionTokens: 50,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    };
    expect(computeWeightedTokens(usage)).toBe(1_050);
  });
});
