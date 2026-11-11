import {
  findItemFileProblems,
  itemFileSchema,
  type ItemFile,
  type ItemProblem,
  type ItemReference,
} from "@village/shared";

export interface ValidationContext {
  references: readonly ItemReference[];
  currencyDefinitionId: string;
}

/** The sections of the file whose entries the editor lists one by one. */
export type FileSection = "definitions" | "verbs" | "conditions" | "reactions";

function describeEntry(file: ItemFile, section: FileSection, index: number): string {
  if (section === "definitions") return file.definitions[index]?.id ?? "";
  if (section === "verbs") return file.verbs[index]?.name ?? "";
  if (section === "conditions") return file.conditions[index]?.name ?? "";
  return file.reactions[index]?.stimulus ?? "";
}

function isFileSection(key: unknown): key is FileSection {
  return key === "definitions" || key === "verbs" || key === "conditions" || key === "reactions";
}

/** "verbs.3 (eat).effects.0", matching the paths `findItemFileProblems` writes. */
export function formatIssuePath(file: ItemFile, path: readonly PropertyKey[]): string {
  const [section, index, ...rest] = path;
  if (!isFileSection(section) || typeof index !== "number") return path.map(String).join(".");
  const entry = `${section}.${index} (${describeEntry(file, section, index)})`;
  return [entry, ...rest.map(String)].join(".");
}

/** Shape errors from the schema, then every cross-reference problem `findItemFileProblems` finds. */
export function findDraftProblems(draft: ItemFile, context: ValidationContext): ItemProblem[] {
  const parsed = itemFileSchema.safeParse(draft);
  const shapeProblems: ItemProblem[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        severity: "error",
        path: formatIssuePath(draft, issue.path),
        message: issue.message,
      }));
  return [
    ...shapeProblems,
    ...findItemFileProblems(parsed.success ? parsed.data : draft, {
      references: context.references,
      currencyDefinitionId: context.currencyDefinitionId,
    }),
  ];
}

/** Problems about one entry, including "definitions (knife)" for a definition the map uses. */
export function selectEntryProblems(
  problems: readonly ItemProblem[],
  file: ItemFile,
  section: FileSection,
  index: number,
): ItemProblem[] {
  const entryPath = `${section}.${index} (${describeEntry(file, section, index)})`;
  const referencePath = `${section} (${describeEntry(file, section, index)})`;
  return problems.filter(
    (problem) =>
      problem.path === entryPath ||
      problem.path.startsWith(`${entryPath}.`) ||
      problem.path === referencePath,
  );
}

/** Problems under a top-level key that isn't listed entry by entry: "components.weight". */
export function selectProblemsUnder(
  problems: readonly ItemProblem[],
  prefix: string,
): ItemProblem[] {
  return problems.filter(
    (problem) => problem.path === prefix || problem.path.startsWith(`${prefix}.`),
  );
}
