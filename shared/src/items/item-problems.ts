import type { ItemFile } from "./item-file";

export type ItemProblemSeverity = "error" | "warning";

/** One thing wrong with `items.json`. Errors stop the server; warnings are shown in the editor. */
export interface ItemProblem {
  severity: ItemProblemSeverity;
  /** Where in the file: "verbs.3 (eat).steps.0", "definitions.2 (jar).components.size". */
  path: string;
  message: string;
}

/** A definition id used outside `items.json`: by a map object or a seed inventory. */
export interface ItemReference {
  definitionId: string;
  /** "map object tavern chest", "seed agent mara's inventory". */
  usedBy: string;
}

export interface ItemValidationOptions {
  references?: readonly ItemReference[];
}

/** What every check needs: the file, its definition ids and where to report. */
export interface ValidationContext {
  file: ItemFile;
  definitionIds: ReadonlySet<string>;
  problems: ProblemList;
}

export class ProblemList {
  readonly problems: ItemProblem[] = [];

  error(path: string, message: string): void {
    this.problems.push({ severity: "error", path, message });
  }

  warning(path: string, message: string): void {
    this.problems.push({ severity: "warning", path, message });
  }
}

export function hasItemErrors(problems: readonly ItemProblem[]): boolean {
  return problems.some((problem) => problem.severity === "error");
}

/** "verbs.3 (eat): A verb ...", one line per problem, for logs and startup errors. */
export function describeItemProblems(problems: readonly ItemProblem[]): string {
  return problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n");
}
