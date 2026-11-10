import { describe, expect, it } from "vitest";
import { splitPromptSections } from "./split-prompt-sections";

describe("splitPromptSections", () => {
  it("keeps text before the first heading as an untitled section", () => {
    const sections = splitPromptSections("You are Ada.\n## Needs\nhungry");
    expect(sections).toEqual([
      { title: null, body: "You are Ada." },
      { title: "Needs", body: "hungry" },
    ]);
  });

  it("opens a section at every line starting with the heading marker", () => {
    const sections = splitPromptSections("## One\na\nb\n## Two\nc");
    expect(sections.map((section) => section.title)).toEqual(["One", "Two"]);
    expect(sections[0]?.body).toBe("a\nb");
  });

  it("keeps empty sections that have a heading", () => {
    expect(splitPromptSections("## Empty\n## Full\nx")).toEqual([
      { title: "Empty", body: "" },
      { title: "Full", body: "x" },
    ]);
  });

  it("does not treat deeper headings or indented markers as sections", () => {
    const sections = splitPromptSections("## Top\n### Sub\n  ## not a heading");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.body).toBe("### Sub\n  ## not a heading");
  });

  it("handles Windows line endings and an empty prompt", () => {
    expect(splitPromptSections("## A\r\nline")).toEqual([{ title: "A", body: "line" }]);
    expect(splitPromptSections("")).toEqual([]);
  });

  it("trims blank lines around a section body but keeps inner ones", () => {
    expect(splitPromptSections("## A\n\nfirst\n\nsecond\n\n")).toEqual([
      { title: "A", body: "first\n\nsecond" },
    ]);
  });
});
