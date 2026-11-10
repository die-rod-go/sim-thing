import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";

export type TemplateValues = Record<string, string>;

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const EXCESS_BLANK_LINES_PATTERN = /\n{3,}/g;

/** The repo root, so the prompts directory resolves the same whatever the working directory. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function resolvePromptsDirectory(): string {
  return path.resolve(REPO_ROOT, config.server.promptsDirectory);
}

/** Replaces every `{{name}}`; throws if a placeholder has no value or a value has no placeholder. */
export function fillTemplate(
  template: string,
  values: TemplateValues,
  templateName = "template",
): string {
  const placeholderNames = new Set(
    Array.from(template.matchAll(PLACEHOLDER_PATTERN), (match) => match[1] ?? ""),
  );
  const missingNames = [...placeholderNames].filter((name) => !(name in values));
  if (missingNames.length > 0) {
    throw new Error(`No value for placeholder(s) in ${templateName}: ${missingNames.join(", ")}`);
  }
  const unknownNames = Object.keys(values).filter((name) => !placeholderNames.has(name));
  if (unknownNames.length > 0) {
    throw new Error(`Unknown placeholder(s) for ${templateName}: ${unknownNames.join(", ")}`);
  }
  return template
    .replace(PLACEHOLDER_PATTERN, (_match, name: string) => values[name] ?? "")
    .replace(EXCESS_BLANK_LINES_PATTERN, "\n\n")
    .trim();
}

/** Reads `<name>.txt` fresh on every call, so prompts can be tuned while the sim runs. */
export function loadTemplate(
  templateName: string,
  promptsDirectory: string = resolvePromptsDirectory(),
): string {
  const template = readFileSync(path.join(promptsDirectory, `${templateName}.txt`), "utf8");
  return template.replace(/\r\n/g, "\n");
}

export function renderTemplate(
  templateName: string,
  values: TemplateValues,
  promptsDirectory?: string,
): string {
  return fillTemplate(loadTemplate(templateName, promptsDirectory), values, templateName);
}
