import type { ComponentRead } from "./effect-reads";
import type { ValuePathSubject } from "./effect-schema";
import type { EffectCheckContext } from "./effect-validation";

export interface ReadCheck {
  reads: readonly ComponentRead[];
  /** Whose fields may be read here: a verb reads `item`, a rule reads `self`. */
  allowedWho: ValuePathSubject;
  /** Components the matcher guarantees; null when there is nothing to read (no appliesTo). */
  guaranteed: ReadonlySet<string> | null;
  /** What the guarantee comes from: "appliesTo" or "`if`". */
  source: string;
  path: string;
}

/** Reads must name the owner's own thing, a component it is sure to have, and a fitting field. */
export function checkComponentReads(check: ReadCheck, context: EffectCheckContext): void {
  const { problems, file } = context;
  for (const read of check.reads) {
    const where = `${check.path}.${read.where}`;
    const name = `${read.who}.${read.component}.${read.field}`;
    if (read.who !== check.allowedWho) {
      problems.error(
        where,
        read.who === "self"
          ? `Reads ${name}, but a verb has no self.`
          : `Reads ${name}, but a rule has no item.`,
      );
    } else if (check.guaranteed === null) {
      problems.error(where, `Reads ${name}, but there is no item without appliesTo.`);
    } else if (!check.guaranteed.has(read.component)) {
      problems.error(
        where,
        `Reads ${name}, but ${check.source} doesn't require the ${read.component} component.`,
      );
    } else {
      const field = file.components[read.component]?.fields[read.field];
      if (field === undefined) {
        problems.error(where, `Component ${read.component} has no field "${read.field}".`);
      } else if (field.type !== read.expectedType) {
        problems.error(
          where,
          `${read.component}.${read.field} is a ${field.type}, but this needs a ${read.expectedType}.`,
        );
      }
    }
  }
}
