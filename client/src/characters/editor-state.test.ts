import { describe, expect, it } from "vitest";
import type { SeedAgent, SeedFile, SeedFileMessage } from "@village/shared";
import { hasUnsavedChanges, initialEditorState, reduceEditorState } from "./editor-state";

const agent: SeedAgent = {
  id: "mara",
  name: "Mara",
  profession: "baker",
  spawnPlace: "rose cottage",
  traits: { extraversion: 0, agreeableness: 0, conscientiousness: 0, neuroticism: 0, openness: 0 },
  core: "",
  selfImage: "",
  sleepRecoveryPerHour: 0.15,
  strength: 0.5,
  agility: 0.5,
  inventory: { coin: 30 },
  mood: "",
  goals: [],
  peopleNotes: {},
};

const seedFile: SeedFile = { agents: [agent] };

const loadedMessage: SeedFileMessage = {
  type: "seed_file",
  seedFile,
  loadError: null,
  rules: {
    traitRange: { min: -1, max: 1 },
    statRange: { min: 0, max: 1 },
    sleepRecoveryRange: { min: 0.12, max: 0.18 },
    spawnPlaces: ["rose cottage"],
    inventoryItems: [{ id: "bread", name: "bread" }],
  },
  newAgentTemplate: agent,
};

const loaded = reduceEditorState(initialEditorState, { kind: "loaded", message: loadedMessage });
const edited = reduceEditorState(loaded, {
  kind: "edited",
  draft: { agents: [{ ...agent, inventory: { coin: 12 } }] },
});

describe("reduceEditorState", () => {
  it("starts with no unsaved changes after loading", () => {
    expect(loaded.draft).toEqual(seedFile);
    expect(hasUnsavedChanges(loaded)).toBe(false);
  });

  it("counts an edit as unsaved, but not a blank note on its own", () => {
    expect(hasUnsavedChanges(edited)).toBe(true);
    const blankNote = reduceEditorState(loaded, {
      kind: "edited",
      draft: { agents: [{ ...agent, peopleNotes: { Edwin: "" } }] },
    });
    expect(hasUnsavedChanges(blankNote)).toBe(false);
  });

  it("treats the sent file as saved once the server confirms it", () => {
    const sent = reduceEditorState(edited, {
      kind: "save_started",
      file: edited.draft ?? seedFile,
    });
    const saved = reduceEditorState(sent, {
      kind: "saved",
      message: { type: "seed_file_saved", isSaved: true, isWorldReset: false, problems: [] },
    });
    expect(saved.saveStatus).toBe("saved");
    expect(hasUnsavedChanges(saved)).toBe(false);
  });

  it("keeps the edits and shows the server's problems when a save is refused", () => {
    const sent = reduceEditorState(edited, {
      kind: "save_started",
      file: edited.draft ?? seedFile,
    });
    const problem = { severity: "error", agentIndex: 0, field: "id", message: "Taken." } as const;
    const refused = reduceEditorState(sent, {
      kind: "saved",
      message: {
        type: "seed_file_saved",
        isSaved: false,
        isWorldReset: false,
        problems: [problem],
      },
    });
    expect(refused.serverProblems).toEqual([problem]);
    expect(hasUnsavedChanges(refused)).toBe(true);
  });

  it("keeps the selection inside the list when a character is removed", () => {
    const selectedLast = reduceEditorState(loaded, { kind: "selected", selectedIndex: 5 });
    expect(selectedLast.selectedIndex).toBe(0);
  });
});
