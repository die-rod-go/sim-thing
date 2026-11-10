export interface PromptSection {
  /** Heading text without the "## " marker; null for text before the first heading. */
  title: string | null;
  body: string;
}

const SECTION_MARKER = "## ";

/** Splits a prompt into sections; a line starting with "## " opens a new section. */
export function splitPromptSections(prompt: string): PromptSection[] {
  const sections: PromptSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const closeSection = (): void => {
    const body = currentLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (currentTitle !== null || body.length > 0) sections.push({ title: currentTitle, body });
  };

  for (const line of prompt.split(/\r?\n/)) {
    if (line.startsWith(SECTION_MARKER)) {
      closeSection();
      currentTitle = line.slice(SECTION_MARKER.length).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  closeSection();
  return sections;
}
