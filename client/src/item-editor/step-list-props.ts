import type { ItemFile, ItemProblem, Step } from "@village/shared";
import type { StepOwner } from "./step-owner";

export interface StepListProps {
  steps: readonly Step[];
  /** The verb or rule the steps belong to, as it is now. */
  owner: StepOwner;
  file: ItemFile;
  /** Every problem of the file; the list picks out its own by `ownerPath`. */
  problems: readonly ItemProblem[];
  /** "verbs.3 (eat)": the path problems about this verb or rule start with. */
  ownerPath: string;
  onChange: (steps: Step[]) => void;
}
