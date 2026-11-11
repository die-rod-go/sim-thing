import { useState } from "react";
import type { ItemFile, ItemProblem } from "@village/shared";
import { clientConfig } from "../client-config";
import { selectEntryProblems } from "./problems";
import { formatRuleText, parseRuleText, summarizeRule, updateRule } from "./rules-edits";
import { ItemProblemList } from "./widgets";

/** One rule as JSON text: valid text is applied as you type, invalid text stays and shows why. */
export function RulesPanel({
  file,
  index,
  problems,
  onEdit,
}: {
  file: ItemFile;
  index: number;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  const rule = file.rules[index];
  const [draftText, setDraftText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!rule) return null;
  const text = draftText ?? formatRuleText(rule);

  const change = (nextText: string) => {
    setDraftText(nextText);
    const parsed = parseRuleText(nextText);
    setError(parsed.error);
    if (parsed.rule) onEdit(updateRule(file, index, parsed.rule));
  };

  return (
    <div className="character-form">
      <section className="form-section">
        <p className="field-hint">{summarizeRule(rule)}</p>
        <textarea
          className="rule-json"
          rows={clientConfig.itemEditor.ruleTextAreaRows}
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={() => {
            if (error === null) setDraftText(null);
          }}
        />
        {error !== null && <p className="banner banner-error">{error}</p>}
      </section>
      <ItemProblemList problems={selectEntryProblems(problems, file, "rules", index)} />
    </div>
  );
}
