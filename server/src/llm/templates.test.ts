import { describe, expect, it } from "vitest";
import { fillTemplate, renderTemplate } from "./templates";

describe("templates", () => {
  it("substitutes placeholders", () => {
    expect(fillTemplate("Hello {{name}}, it is {{ time }}.", { name: "Mara", time: "dawn" })).toBe(
      "Hello Mara, it is dawn.",
    );
  });

  it("throws on a missing template placeholder", () => {
    expect(() => fillTemplate("Hello {{name}} at {{place}}", { name: "Mara" })).toThrow(/place/);
  });

  it("throws on a value with no placeholder", () => {
    expect(() => fillTemplate("Hello {{name}}", { name: "Mara", mood: "glad" })).toThrow(/mood/);
  });

  it("loads templates from the prompts directory", () => {
    const prompt = renderTemplate("interact", {
      agentName: "Mara",
      objectName: "oven",
      intention: "bake",
      options: "- bake bread",
    });
    expect(prompt).toContain("You are Mara");
  });
});
