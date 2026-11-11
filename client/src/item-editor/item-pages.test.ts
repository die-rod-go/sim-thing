import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseItemFile } from "@village/shared";
import { ComponentPanel } from "./DeclarationPanels";
import { ItemPage } from "./ItemPage";
import { RulesPanel } from "./RulesPanel";
import { listStimuli } from "./verb-edits";
import { VerbEditor } from "./VerbEditor";

const itemFile = parseItemFile(
  JSON.parse(readFileSync(new URL("../../../seeds/items.json", import.meta.url), "utf8")),
);
const ignoreEdit = () => undefined;
const common = { file: itemFile, problems: [], stimuli: listStimuli(itemFile), onEdit: ignoreEdit };

describe("item editor pages", () => {
  it("renders every item, verb and component in the project's items.json", () => {
    for (const [index, definition] of itemFile.definitions.entries()) {
      const html = renderToString(createElement(ItemPage, { ...common, definitionIndex: index }));
      expect(html).toContain(definition.name);
    }
    for (const verb of itemFile.verbs) {
      const html = renderToString(
        createElement(VerbEditor, { ...common, verb, onChange: ignoreEdit }),
      );
      expect(html).toContain("Matches:");
    }
    for (const name of Object.keys(itemFile.components)) {
      expect(renderToString(createElement(ComponentPanel, { ...common, name }))).toContain(name);
    }
  });

  it("renders a rule's trigger summary and JSON", () => {
    const file = parseItemFile({
      ...itemFile,
      rules: [
        {
          trigger: "stimulus",
          stimulus: "fire",
          if: { has: "flammable" },
          steps: [{ step: "announce", text: "caught fire" }],
        },
      ],
    });
    const html = renderToString(createElement(RulesPanel, { ...common, file, index: 0 }));
    expect(html).toContain("flammable");
    expect(html).toContain("caught fire");
  });
});
