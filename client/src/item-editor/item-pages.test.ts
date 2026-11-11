import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseItemFile } from "@village/shared";
import { ConditionPanel, ReactionPanel } from "./ConditionPanels";
import { ComponentPanel } from "./DeclarationPanels";
import { ItemPage } from "./ItemPage";
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

  it("renders conditions and reactions", () => {
    const file = parseItemFile({
      ...itemFile,
      components: {
        ...itemFile.components,
        burning: { words: "on fire", isVisible: true },
      },
      conditions: [{ name: "burning", defaultMinutes: 10 }],
      reactions: [
        {
          stimulus: "fire",
          if: { has: "flammable" },
          effects: [{ type: "add_condition", condition: "burning" }],
        },
      ],
    });
    const props = { ...common, file, index: 0 };
    expect(renderToString(createElement(ConditionPanel, props))).toContain("burning");
    expect(renderToString(createElement(ComponentPanel, { ...props, name: "burning" }))).toContain(
      "on fire",
    );
    expect(renderToString(createElement(ReactionPanel, props))).toContain("flammable");
  });
});
