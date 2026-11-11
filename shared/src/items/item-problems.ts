import type { ItemForm } from "./item-file";

export type ItemProblemSeverity = "error" | "warning";

/** One thing wrong with `items.json`. Errors stop the server; warnings are shown in the editor. */
export interface ItemProblem {
  severity: ItemProblemSeverity;
  /** Where in the file: "verbs.3 (eat).effects.0", "definitions.2 (oven).components.stock". */
  path: string;
  message: string;
}

/** A definition id used outside `items.json`: by a map object or a seed inventory. */
export interface ItemReference {
  definitionId: string;
  /** The form the user needs (map objects are placeable, inventories carriable); null for any. */
  requiredForm: ItemForm | null;
  /** "map object bakery door", "seed agent mara's inventory". */
  usedBy: string;
}

export interface ItemValidationOptions {
  references?: readonly ItemReference[];
  /** The money definition. Nothing should make or destroy it, so the supply stays closed. */
  currencyDefinitionId?: string;
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
