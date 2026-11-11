import { useState } from "react";
import type { Step } from "@village/shared";
import { clientConfig } from "../client-config";
import { formatStepsText, parseStepsText } from "./step-edits";

/** A verb's steps as JSON text: valid text is applied as you type, invalid text stays and shows why. */
export function StepsEditor({
  steps,
  onChange,
}: {
  steps: readonly Step[];
  onChange: (steps: Step[]) => void;
}) {
  const [draftText, setDraftText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const change = (text: string) => {
    setDraftText(text);
    const parsed = parseStepsText(text);
    setError(parsed.error);
    if (parsed.steps) onChange(parsed.steps);
  };
  return (
    <>
      <textarea
        className="rule-json"
        rows={clientConfig.itemEditor.ruleTextAreaRows}
        value={draftText ?? formatStepsText(steps)}
        onChange={(event) => change(event.target.value)}
        onBlur={() => {
          if (error === null) setDraftText(null);
        }}
      />
      {error !== null && <p className="banner banner-error">{error}</p>}
    </>
  );
}
