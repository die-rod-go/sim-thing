import { matcherSchema, type Matcher } from "@village/shared";
import { CommittedTextInput } from "../characters/fields";

/** A matcher as JSON text; text that isn't a valid matcher is kept on screen but not applied. */
export function MatcherInput({
  matcher,
  onChange,
}: {
  matcher: Matcher;
  onChange: (matcher: Matcher) => void;
}) {
  return (
    <CommittedTextInput
      value={JSON.stringify(matcher)}
      placeholder='{"has": "flammable"}'
      onCommit={(text) => {
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return;
        }
        const parsed = matcherSchema.safeParse(json);
        if (parsed.success) onChange(parsed.data);
      }}
    />
  );
}
